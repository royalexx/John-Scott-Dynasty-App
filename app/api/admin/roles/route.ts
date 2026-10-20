import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"

async function requireCommissioner() {
  const session = await getManagerSession()
  if (!session?.isCommissioner) return null
  const user = await prisma.user.findUnique({ where: { id: session.managerId }, select: { isCommissioner: true } })
  return user?.isCommissioner ? session : null
}

export async function GET() {
  const session = await requireCommissioner()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const team = await prisma.team.findUnique({ where: { id: session.teamId }, select: { leagueId: true } })
  if (!team) return NextResponse.json({ error: "League not found." }, { status: 404 })
  const managers = await prisma.user.findMany({
    where: { managedTeams: { some: { leagueId: team.leagueId } } },
    select: { id: true, name: true, handle: true, isCommissioner: true },
    orderBy: { handle: "asc" },
  })
  return NextResponse.json({ managers })
}

export async function PATCH(request: Request) {
  const session = await requireCommissioner()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const body = await request.json().catch(() => null) as { targetManagerId?: unknown; isCommissioner?: unknown } | null
  if (typeof body?.targetManagerId !== "string" || typeof body.isCommissioner !== "boolean") {
    return NextResponse.json({ error: "targetManagerId and isCommissioner are required." }, { status: 400 })
  }
  if (body.targetManagerId === session.managerId && !body.isCommissioner) {
    return NextResponse.json({ error: "You cannot remove your own commissioner role." }, { status: 400 })
  }
  const team = await prisma.team.findUnique({ where: { id: session.teamId }, select: { leagueId: true } })
  const target = team
    ? await prisma.user.findFirst({
        where: { id: body.targetManagerId, managedTeams: { some: { leagueId: team.leagueId } } },
        select: { id: true },
      })
    : null
  if (!target) return NextResponse.json({ error: "Manager not found in this league." }, { status: 404 })
  await prisma.user.update({
    where: { id: body.targetManagerId },
    data: { isCommissioner: body.isCommissioner },
  })
  return NextResponse.json({ success: true })
}
