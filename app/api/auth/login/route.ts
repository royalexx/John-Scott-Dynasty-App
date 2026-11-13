import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession, signManagerSession } from "@/lib/auth-session"
import { hashManagerPin, isHashedManagerPin, verifyManagerPin } from "@/lib/pin-crypto"
import { verifyWithPinThrottle } from "@/lib/pin-rate-limit"

const PIN_PATTERN = /^\d{4}$/
const MANAGER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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


export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { managerId?: unknown; pin?: unknown } | null
  if (typeof body?.managerId !== "string" || typeof body.pin !== "string" || !PIN_PATTERN.test(body.pin)) {
    return NextResponse.json({ error: "A manager and 4-digit PIN are required." }, { status: 400 })
  }

  const result = await verifyWithPinThrottle(request, body.managerId, async (tx) => {
    const user = MANAGER_ID_PATTERN.test(body.managerId as string)
      ? await tx.user.findUnique({ where: { id: body.managerId as string } })
      : null
    if (!user || !verifyManagerPin(user.pin, body.pin as string)) return { valid: false as const }

    // Opportunistically migrate legacy plaintext credentials. The manager
    // lock prevents overlapping sign-ins from using a stale credential hash.
    let credentialVersion = user.updatedAt.toISOString()
    if (!isHashedManagerPin(user.pin)) {
      const upgraded = await tx.user.updateMany({
        where: { id: user.id, pin: user.pin },
        data: { pin: hashManagerPin(body.pin as string) },
      })
      if (upgraded.count !== 1) return { valid: false as const }
      const migrated = await tx.user.findUnique({ where: { id: user.id }, select: { updatedAt: true } })
      if (!migrated) return { valid: false as const }
      credentialVersion = migrated.updatedAt.toISOString()
    }
    const team = await tx.team.findFirst({ where: { managerId: user.id }, orderBy: { name: "asc" } })
    return { valid: true as const, value: { user, team, credentialVersion } }
  })
  if (result.kind === "limited") return tooManyAttempts(result.retryAfterSeconds)
  if (result.kind !== "allowed" || !result.value) return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 })

  const { user, team, credentialVersion } = result.value
  if (!team) return NextResponse.json({ error: "No team is assigned to this manager." }, { status: 404 })

  const session = signManagerSession({
    managerId: user.id,
    teamId: team.id,
    handle: user.handle,
    teamName: team.name,
    isCommissioner: user.isCommissioner,
  }, credentialVersion)
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

  const result = await verifyWithPinThrottle(request, session.managerId, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: session.managerId } })
    if (!user || !verifyManagerPin(user.pin, body.currentPin as string)) return { valid: false as const }
    const updated = await tx.user.update({
      where: { id: session.managerId },
      data: { pin: hashManagerPin(body.newPin as string) },
      select: { updatedAt: true },
    })
    return { valid: true as const, value: { updatedAt: updated.updatedAt.toISOString() } }
  })
  if (result.kind === "limited") return tooManyAttempts(result.retryAfterSeconds)
  if (result.kind !== "allowed" || !result.value) return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 401 })

  // The updatedAt credential version invalidates every previously issued cookie.
  // Reissue only this device's session so a successful PIN change does not log it out.
  const refreshed = signManagerSession(session, result.value.updatedAt)
  const response = NextResponse.json({ success: true })
  response.cookies.set("dynasty_manager", refreshed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}
