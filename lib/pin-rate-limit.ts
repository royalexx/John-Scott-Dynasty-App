import { createHmac } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

const MAX_FAILED_ATTEMPTS = 5
const WINDOW_MS = 5 * 60 * 1000

export type PinAttemptResult<T> =
  | { kind: "allowed"; value: T }
  | { kind: "invalid" }
  | { kind: "limited"; retryAfterSeconds: number }

export type PinVerification<T> = { valid: true; value: T } | { valid: false }

/** Hash identifiers before storage: the database must not contain IPs or manager IDs. */
function attemptKey(scope: "manager" | "ip", identifier: string): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is required for PIN throttling")
  return createHmac("sha256", secret).update(scope).update(":").update(identifier).digest("hex")
}

function clientIp(request: Request): string | null {
  // The per-manager limit always applies regardless of proxy header trust.
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for")
  const candidate = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim()
  return candidate || null
}

export function throttleKeys(request: Request, managerId: string): string[] {
  const keys = [attemptKey("manager", managerId)]
  const ip = clientIp(request)
  if (ip) keys.push(attemptKey("ip", ip))
  return [...new Set(keys)].sort()
}

export function remainingPinLockout(
  rows: ReadonlyArray<{ failures: number; resetAt: Date }>,
  now: Date,
): number {
  let retryAfter = 0
  for (const row of rows) {
    if (row.failures >= MAX_FAILED_ATTEMPTS && row.resetAt > now) {
      retryAfter = Math.max(retryAfter, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000))
    }
  }
  return retryAfter
}

/**
 * The transaction locks both throttle buckets before credential verification.
 * It serializes concurrent attempts across all Next.js/Vercel instances, and
 * commits failure counters before returning an invalid PIN result.
 */
export async function verifyWithPinThrottle<T>(
  request: Request,
  managerId: string,
  check: (tx: Prisma.TransactionClient) => Promise<PinVerification<T>>,
): Promise<PinAttemptResult<T>> {
  const keys = throttleKeys(request, managerId)
  return prisma.$transaction(async (tx) => {
    for (const key of keys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
    }
    const now = new Date()
    const buckets = await tx.loginThrottle.findMany({ where: { key: { in: keys } } })
    const retryAfterSeconds = remainingPinLockout(buckets, now)
    if (retryAfterSeconds > 0) return { kind: "limited", retryAfterSeconds } as const

    const checked = await check(tx)
    if (checked.valid) {
      await tx.loginThrottle.deleteMany({ where: { key: { in: keys } } })
      return { kind: "allowed", value: checked.value } as const
    }

    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
    for (const key of keys) {
      const existing = byKey.get(key)
      const live = existing && existing.resetAt > now
      const failures = live ? existing.failures + 1 : 1
      const resetAt = live ? existing.resetAt : new Date(now.getTime() + WINDOW_MS)
      await tx.loginThrottle.upsert({
        where: { key },
        create: { key, failures, resetAt },
        update: { failures, resetAt },
      })
    }
    return { kind: "invalid" } as const
  }, { maxWait: 10_000, timeout: 20_000 })
}
