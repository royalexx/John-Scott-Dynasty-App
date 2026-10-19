import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { signManagerSession } from "@/lib/auth-session"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { managerId?: unknown; pin?: unknown } | null
  if (typeof body?.managerId !== "string" || typeof body.pin !== "string" || !/^\d{4}$/.test(body.pin)) {
    return NextResponse.json({ error: "A manager and 4-digit PIN are required." }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: body.managerId } })
  if (!user || user.pin !== body.pin) {
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 })
  }

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
