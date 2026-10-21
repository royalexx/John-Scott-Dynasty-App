import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"

type TeamSettingsBody = {
  teamId?: unknown
  name?: unknown
  logoUrl?: unknown
}

export async function PATCH(request: NextRequest) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  try {
    const body = await request.json() as TeamSettingsBody
    if (typeof body.teamId !== "string" || !body.teamId.trim()) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 })
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 })
    }
    const name = body.name.trim()
    if (name.length > 40) {
      return NextResponse.json({ error: "Team name must be 40 characters or fewer." }, { status: 400 })
    }
    if (body.logoUrl !== undefined && typeof body.logoUrl !== "string") {
      return NextResponse.json({ error: "logoUrl must be a string" }, { status: 400 })
    }
    const logoUrl = typeof body.logoUrl === "string" ? body.logoUrl.trim() : ""
    if (logoUrl && !logoUrl.startsWith("https://") && !logoUrl.startsWith("/")) {
      return NextResponse.json({ error: "logoUrl must start with https:// or /." }, { status: 400 })
    }
    if (body.teamId !== session.teamId && !session.isCommissioner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const team = await prisma.team.update({
      where: { id: body.teamId },
      data: {
        name,
        logoUrl: logoUrl || null,
      },
      select: { id: true, name: true, logoUrl: true },
    })
    return NextResponse.json(team)
  } catch (error: unknown) {
    console.error("Could not update team settings", error)
    return NextResponse.json({ error: "Could not update team settings" }, { status: 500 })
  }
}
