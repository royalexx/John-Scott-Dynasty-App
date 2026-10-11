import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

type TeamSettingsBody = {
  teamId?: unknown
  name?: unknown
  logoUrl?: unknown
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as TeamSettingsBody
    if (typeof body.teamId !== "string" || !body.teamId.trim()) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 })
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 })
    }
    if (body.logoUrl !== undefined && typeof body.logoUrl !== "string") {
      return NextResponse.json({ error: "logoUrl must be a string" }, { status: 400 })
    }

    const team = await prisma.team.update({
      where: { id: body.teamId },
      data: {
        name: body.name.trim(),
        logoUrl: typeof body.logoUrl === "string" && body.logoUrl.trim() ? body.logoUrl.trim() : null,
      },
      select: { id: true, name: true, logoUrl: true },
    })
    return NextResponse.json(team)
  } catch (error: unknown) {
    console.error("Could not update team settings", error)
    return NextResponse.json({ error: "Could not update team settings" }, { status: 500 })
  }
}
