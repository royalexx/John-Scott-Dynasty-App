import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"

type ManagerSession = {
  managerId: string
  teamId: string
  handle: string
  teamName: string
}

async function readSession(): Promise<ManagerSession | null> {
  const value = (await cookies()).get("dynasty_manager")?.value
  if (!value) return null
  try {
    const session = JSON.parse(value) as Partial<ManagerSession>
    if (
      typeof session.managerId !== "string" ||
      typeof session.teamId !== "string" ||
      typeof session.handle !== "string" ||
      typeof session.teamName !== "string"
    ) return null
    const team = await prisma.team.findFirst({
      where: { id: session.teamId, managerId: session.managerId },
      select: { id: true, name: true },
    })
    if (!team) return null
    return { ...session, teamName: team.name } as ManagerSession
  } catch {
    return null
  }
}

export async function GET() {
  const user = await readSession()
  return NextResponse.json({ authenticated: Boolean(user), user })
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set("dynasty_manager", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
  return response
}
