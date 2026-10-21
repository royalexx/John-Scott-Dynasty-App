import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"

export type ManagerSession = {
  managerId: string
  teamId: string
  handle: string
  teamName: string
  isCommissioner: boolean
}

const DEV_SESSION_SECRET = "john-scott-dynasty-default-secret"
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

type SignedSession = Partial<ManagerSession> & { iat?: number; exp?: number }

function sessionSecret() {
  const secret = process.env.SESSION_SECRET ?? process.env.CRON_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET or CRON_SECRET must be set in production")
  }
  return DEV_SESSION_SECRET
}

export function verifyCronSecret(provided: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !provided) return false
  const providedBytes = Buffer.from(provided)
  const secretBytes = Buffer.from(secret)
  if (providedBytes.length !== secretBytes.length) return false
  return timingSafeEqual(providedBytes, secretBytes)
}

export function signManagerSession(payload: ManagerSession): string {
  const issuedAt = Math.floor(Date.now() / 1000)
  const encoded = Buffer.from(JSON.stringify({ ...payload, iat: issuedAt, exp: issuedAt + SESSION_TTL_SECONDS })).toString("base64url")
  const signature = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

export function verifyManagerSessionCookie(rawCookie: string): Partial<ManagerSession> | null {
  const separator = rawCookie.indexOf(".")
  if (separator <= 0 || rawCookie.indexOf(".", separator + 1) !== -1) return null
  const encoded = rawCookie.slice(0, separator)
  const signature = rawCookie.slice(separator + 1)
  const expected = createHmac("sha256", sessionSecret()).update(encoded).digest()
  const provided = Buffer.from(signature, "base64url")
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    if (!parsed || typeof parsed !== "object") return null
    const session = parsed as SignedSession
    const now = Math.floor(Date.now() / 1000)
    if ("exp" in session && session.exp !== undefined) {
      if (typeof session.exp !== "number" || !Number.isFinite(session.exp) || session.exp <= now) return null
    }
    if ("iat" in session && session.iat !== undefined) {
      if (typeof session.iat !== "number" || !Number.isFinite(session.iat) || session.iat > now) return null
    }
    return session
  } catch {
    return null
  }
}

export async function getManagerSession(): Promise<ManagerSession | null> {
  const value = (await cookies()).get("dynasty_manager")?.value
  if (!value) return null
  try {
    const session = verifyManagerSessionCookie(value)
    if (!session || typeof session.managerId !== "string" || typeof session.teamId !== "string") return null
    const team = await prisma.team.findFirst({
      where: { id: session.teamId, managerId: session.managerId },
      select: { id: true, name: true, manager: { select: { isCommissioner: true, handle: true } } },
    })
    if (!team) return null
    return {
      managerId: session.managerId,
      teamId: team.id,
      handle: team.manager.handle,
      teamName: team.name,
      isCommissioner: team.manager.isCommissioner === true,
    }
  } catch {
    return null
  }
}
