import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import { formatActivity } from "@/lib/activity-format"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getManagerSession()
  const requestedLeagueId = request.nextUrl.searchParams.get("leagueId")
  const team = session ? await prisma.team.findFirst({ where: { id: session.teamId, managerId: session.managerId }, select: { leagueId: true } }) : null
  const leagueId = requestedLeagueId ?? team?.leagueId
  if (!leagueId || !team || (requestedLeagueId !== null && requestedLeagueId !== team.leagueId)) {
    return NextResponse.json({ error: "Authentication required for this league." }, { status: 401 })
  }
  const records = await prisma.activityLog.findMany({
    where: { leagueId },
    include: { team: { select: { name: true, manager: { select: { name: true, handle: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return NextResponse.json({ activities: records.map(formatActivity) })
}
