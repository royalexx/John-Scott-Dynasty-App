import { NextRequest, NextResponse } from "next/server"
import { ClaimStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import { submitWaiverClaim } from "@/lib/services/transactions"
import { currentWeekOpenedAt, waiverOutcomeLabel } from "@/lib/waiver-run"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const teamId = request.nextUrl.searchParams.get("teamId") ?? session.teamId
  if (teamId !== session.teamId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { faabBalance: true, league: { select: { currentSeason: true } } } })
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 })
  const openedAt = currentWeekOpenedAt(team.league.currentSeason)
  const historyCutoff = new Date(openedAt.getTime() - 28 * 86_400_000)
  const include = { playerToAdd: { select: { name: true } }, playerToDrop: { select: { name: true } } } as const
  const [pendingClaims, resolvedClaims, committed] = await Promise.all([
    prisma.waiverClaim.findMany({
      where: { teamId, status: ClaimStatus.PENDING },
      include,
      orderBy: { bidAmount: "desc" },
    }),
    prisma.waiverClaim.findMany({
      where: { teamId, status: { in: [ClaimStatus.SUCCESSFUL, ClaimStatus.FAILED] }, processDate: { gte: historyCutoff } },
      include,
      orderBy: { processDate: "desc" },
    }),
    prisma.waiverClaim.aggregate({
      where: { teamId, status: ClaimStatus.PENDING },
      _sum: { bidAmount: true },
    }),
  ])
  const presented = [...pendingClaims, ...resolvedClaims].map((claim) => ({
    id: claim.id,
    bidAmount: claim.bidAmount,
    status: claim.status === ClaimStatus.SUCCESSFUL ? "won" as const : claim.status === ClaimStatus.FAILED ? "failed" as const : "pending" as const,
    outcome: waiverOutcomeLabel(claim.status, claim.resolution),
    processDate: claim.processDate.toISOString(),
    playerToAdd: claim.playerToAdd,
    playerToDrop: claim.playerToDrop,
  }))
  const rank = { pending: 0, won: 1, failed: 2 }
  presented.sort((left, right) => {
    const byStatus = rank[left.status] - rank[right.status]
    if (byStatus !== 0) return byStatus
    if (left.status === "pending") return right.bidAmount - left.bidAmount
    return Date.parse(right.processDate) - Date.parse(left.processDate)
  })
  return NextResponse.json({
    claims: presented,
    faabBalance: team.faabBalance,
    committedFaab: committed._sum.bidAmount ?? 0,
  })
}

export async function POST(request: NextRequest) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  try {
    const body = await request.json() as { teamId?: string; playerToAddId?: number; playerToDropId?: number | null; bidAmount?: number }
    if (!body.teamId || !Number.isInteger(body.playerToAddId) || !Number.isInteger(body.bidAmount)) return NextResponse.json({ error: "teamId, playerToAddId, and bidAmount are required" }, { status: 400 })
    if (body.teamId !== session.teamId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const claim = await submitWaiverClaim({
      teamId: body.teamId,
      playerToAddId: body.playerToAddId as number,
      playerToDropId: body.playerToDropId ?? null,
      bidAmount: body.bidAmount as number,
    })
    return NextResponse.json({ claim }, { status: 201 })
  } catch (error: unknown) {
    console.error("Waiver claim submission failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Waiver claim submission failed" }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  try {
    const body = await request.json() as { claimId?: string; teamId?: string }
    if (!body.claimId || !body.teamId) return NextResponse.json({ error: "claimId and teamId are required" }, { status: 400 })
    if (body.teamId !== session.teamId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const result = await prisma.waiverClaim.updateMany({ where: { id: body.claimId, teamId: body.teamId, status: ClaimStatus.PENDING }, data: { status: ClaimStatus.CANCELLED } })
    if (result.count !== 1) return NextResponse.json({ error: "Pending waiver claim not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Waiver cancellation failed", error)
    return NextResponse.json({ error: "Waiver cancellation failed" }, { status: 400 })
  }
}
