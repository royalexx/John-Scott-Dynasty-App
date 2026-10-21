import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession, signManagerSession } from "@/lib/auth-session"

const MAX_FAILED_ATTEMPTS = 5
const WINDOW_MS = 5 * 60 * 1000
const PIN_PATTERN = /^\d{4}$/
const MANAGER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AttemptBucket = { failures: number; resetAt: number }

const pinRateLimitState = globalThis as typeof globalThis & {
  __dynastyPinAttempts?: Map<string, AttemptBucket>
}
const pinAttempts = pinRateLimitState.__dynastyPinAttempts ?? new Map<string, AttemptBucket>()
pinRateLimitState.__dynastyPinAttempts = pinAttempts

function attemptKey(scope: "manager" | "ip", id: string) {
  return `${scope}:${id}`
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) return forwarded
  const realIp = request.headers.get("x-real-ip")?.trim()
  return realIp || "unknown"
}

function activeBucket(key: string, now: number) {
  const bucket = pinAttempts.get(key)
  if (!bucket || bucket.resetAt <= now) {
    if (bucket) pinAttempts.delete(key)
    return null
  }
  return bucket
}

function retryAfterSeconds(keys: string[], now: number) {
  let wait = 0
  for (const key of keys) {
    const bucket = activeBucket(key, now)
    if (bucket && bucket.failures >= MAX_FAILED_ATTEMPTS) {
      wait = Math.max(wait, Math.ceil((bucket.resetAt - now) / 1000))
    }
  }
  return wait
}

function recordFailure(key: string, now: number) {
  const bucket = activeBucket(key, now)
  if (!bucket) {
    pinAttempts.set(key, { failures: 1, resetAt: now + WINDOW_MS })
    return
  }
  bucket.failures += 1
  if (pinAttempts.size > 500) {
    for (const [storedKey, stored] of pinAttempts) {
      if (stored.resetAt <= now) pinAttempts.delete(storedKey)
    }
  }
}

function clearFailures(keys: string[]) {
  for (const key of keys) pinAttempts.delete(key)
}

function retryMessage(seconds: number) {
  if (seconds < 60) {
    const count = Math.max(1, seconds)
    return `Too many failed PIN attempts. Try again in ${count} second${count === 1 ? "" : "s"}.`
  }
  const minutes = Math.ceil(seconds / 60)
  return `Too many failed PIN attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
}

function tooManyAttempts(seconds: number) {
  return NextResponse.json(
    { error: retryMessage(seconds) },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  )
}

const SCRYPT_KEY_LENGTH = 32

function hashPin(pin: string) {
  const salt = randomBytes(16).toString("base64url")
  const hash = scryptSync(pin, salt, SCRYPT_KEY_LENGTH).toString("base64url")
  return `scrypt$${salt}$${hash}`
}

function pinsMatch(storedPin: string, providedPin: string) {
  if (storedPin.startsWith("scrypt$")) {
    const [scheme, salt, encoded] = storedPin.split("$")
    const expected = encoded ? Buffer.from(encoded, "base64url") : Buffer.alloc(0)
    if (scheme !== "scrypt" || !salt || expected.length === 0) {
      timingSafeEqual(Buffer.from(providedPin), Buffer.alloc(providedPin.length))
      return false
    }
    const actual = scryptSync(providedPin, salt, expected.length)
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  }
  const provided = Buffer.from(providedPin)
  const stored = Buffer.from(storedPin)
  if (stored.length !== provided.length) {
    timingSafeEqual(provided, Buffer.alloc(provided.length))
    return false
  }
  return timingSafeEqual(stored, provided)
}

function attemptKeys(request: Request, managerId: string) {
  return [attemptKey("manager", managerId), attemptKey("ip", clientIp(request))]
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { managerId?: unknown; pin?: unknown } | null
  if (typeof body?.managerId !== "string" || typeof body.pin !== "string" || !PIN_PATTERN.test(body.pin)) {
    return NextResponse.json({ error: "A manager and 4-digit PIN are required." }, { status: 400 })
  }

  const keys = attemptKeys(request, body.managerId)
  const wait = retryAfterSeconds(keys, Date.now())
  if (wait > 0) return tooManyAttempts(wait)

  const user = MANAGER_ID_PATTERN.test(body.managerId)
    ? await prisma.user.findUnique({ where: { id: body.managerId } })
    : null
  const pinOk = pinsMatch(user?.pin ?? "0000", body.pin)
  if (!user || !pinOk) {
    const now = Date.now()
    for (const key of keys) recordFailure(key, now)
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 })
  }

  clearFailures(keys)

  const team = await prisma.team.findFirst({
    where: { managerId: user.id },
    orderBy: { name: "asc" },
  })
  if (!team) return NextResponse.json({ error: "No team is assigned to this manager." }, { status: 404 })

  const session = signManagerSession({
    managerId: user.id,
    teamId: team.id,
    handle: user.handle,
    teamName: team.name,
    isCommissioner: user.isCommissioner,
  })
  const response = NextResponse.json({ success: true, teamId: team.id, teamName: team.name })
  response.cookies.set("dynasty_manager", session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}

export async function PATCH(request: Request) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Sign in to change your PIN." }, { status: 401 })

  const body = await request.json().catch(() => null) as { currentPin?: unknown; newPin?: unknown } | null
  if (
    typeof body?.currentPin !== "string" ||
    typeof body.newPin !== "string" ||
    !PIN_PATTERN.test(body.currentPin) ||
    !PIN_PATTERN.test(body.newPin)
  ) {
    return NextResponse.json({ error: "Current PIN and new PIN must be 4 digits." }, { status: 400 })
  }

  const keys = attemptKeys(request, session.managerId)
  const wait = retryAfterSeconds(keys, Date.now())
  if (wait > 0) return tooManyAttempts(wait)

  const user = await prisma.user.findUnique({ where: { id: session.managerId } })
  const currentOk = pinsMatch(user?.pin ?? "0000", body.currentPin)
  if (!user || !currentOk) {
    const now = Date.now()
    for (const key of keys) recordFailure(key, now)
    return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 401 })
  }

  clearFailures(keys)
  await prisma.user.update({ where: { id: session.managerId }, data: { pin: hashPin(body.newPin) } })
  return NextResponse.json({ success: true })
}
