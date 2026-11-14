import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import { hashManagerPin, verifyManagerPin } from "@/lib/pin-crypto"
import { verifyWithPinThrottle } from "@/lib/pin-rate-limit"

const PIN = /^\d{4}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Allows a signed-in commissioner to set another manager's PIN within their
 * own league, after verifying the commissioner's current PIN.
 * Neither endpoint responses nor logs disclose plaintext credentials.
 */
export async function PATCH(request: Request) {
  const session = await getManagerSession()
  if (!session?.isCommissioner) {
    return NextResponse.json({ error: "Commissioner access required." }, { status: 403 })
  }
  const body = await request.json().catch(() => null) as {
    targetManagerId?: unknown
    commissionerPin?: unknown
    newPin?: unknown
  } | null
  if (
    typeof body?.targetManagerId !== "string" || !UUID.test(body.targetManagerId) ||
    typeof body.commissionerPin !== "string" || !PIN.test(body.commissionerPin) ||
    typeof body.newPin !== "string" || !PIN.test(body.newPin)
  ) {
    return NextResponse.json({ error: "Select a manager and provide two valid four-digit PINs." }, { status: 400 })
  }
  if (body.targetManagerId === session.managerId) {
    return NextResponse.json({ error: "Change your own PIN through your account settings." }, { status: 400 })
  }
  if (body.newPin === "1234") {
    return NextResponse.json({ error: "Choose a PIN other than the shared test PIN." }, { status: 400 })
  }

  const result = await verifyWithPinThrottle(request, session.managerId, async (tx) => {
    const actor = await tx.user.findUnique({
      where: { id: session.managerId },
      select: { pin: true, isCommissioner: true },
    })
    if (!actor?.isCommissioner || !verifyManagerPin(actor.pin, body.commissionerPin as string)) {
      return { valid: false as const }
    }
    const team = await tx.team.findUnique({
      where: { id: session.teamId },
      select: { leagueId: true, managerId: true },
    })
    if (!team || team.managerId !== session.managerId) {
      return { valid: false as const }
    }
    const updated = await tx.user.updateMany({
      where: {
        id: body.targetManagerId as string,
        managedTeams: { some: { leagueId: team.leagueId } },
      },
      data: { pin: hashManagerPin(body.newPin as string) },
    })
    return { valid: true as const, value: { count: updated.count } }
  })
  if (result.kind === "limited") {
    return NextResponse.json(
      { error: "Too many invalid PIN attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    )
  }
  if (result.kind !== "allowed" || !result.value) {
    return NextResponse.json({ error: "Current commissioner PIN is incorrect." }, { status: 401 })
  }
  if (result.value.count === 0) {
    return NextResponse.json({ error: "Manager not found in your league." }, { status: 404 })
  }
  return NextResponse.json(
    { success: true, message: "Manager PIN updated. Any previous session for that manager is now invalid." },
    { headers: { "Cache-Control": "no-store" } },
  )
}
