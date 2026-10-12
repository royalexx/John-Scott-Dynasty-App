import { NextRequest, NextResponse } from "next/server"
import { TradeStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import { createTradeOffer, executeTrade, type TradeAssetInput } from "@/lib/services/transactions"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const leagueId = request.nextUrl.searchParams.get("leagueId")
  if (!leagueId) return NextResponse.json({ error: "leagueId is required" }, { status: 400 })
  const offers = await prisma.tradeOffer.findMany({
    where: { leagueId, status: { in: [TradeStatus.PENDING, TradeStatus.ACCEPTED, TradeStatus.PROCESSED, TradeStatus.REJECTED] } },
    include: { assets: { include: { player: true, draftPick: true } }, proposingTeam: true, receivingTeam: true },
    orderBy: { createdAt: "desc" },
  })
  const picks = await prisma.draftPick.findMany({
    where: { leagueId },
    select: { id: true, season: true, round: true, currentTeamId: true },
    orderBy: [{ season: "asc" }, { round: "asc" }],
  })
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, manager: { select: { name: true, handle: true } } },
  })
  return NextResponse.json({ offers, picks, teams })
}

export async function POST(request: NextRequest) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  try {
    const body = await request.json() as { leagueId?: string; proposingTeamId?: string; receivingTeamId?: string; assets?: TradeAssetInput[]; expiresAt?: string }
    if (body.proposingTeamId !== session.teamId) return NextResponse.json({ error: "You can only propose trades from your own team" }, { status: 403 })
    if (!body.leagueId || !body.proposingTeamId || !body.receivingTeamId || !Array.isArray(body.assets)) return NextResponse.json({ error: "leagueId, team IDs, and assets are required" }, { status: 400 })
    const offer = await createTradeOffer({
      leagueId: body.leagueId,
      proposingTeamId: body.proposingTeamId,
      receivingTeamId: body.receivingTeamId,
      assets: body.assets,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    })
    return NextResponse.json({ offer }, { status: 201 })
  } catch (error: unknown) {
    console.error("Trade creation failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Trade creation failed" }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  try {
    const body = await request.json() as { tradeOfferId?: string; action?: "ACCEPT" | "REJECT" | "CANCEL" }
    if (!body.tradeOfferId || !body.action) return NextResponse.json({ error: "tradeOfferId and action are required" }, { status: 400 })
    if (!["ACCEPT", "REJECT", "CANCEL"].includes(body.action)) return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    const offer = await prisma.tradeOffer.findUnique({ where: { id: body.tradeOfferId }, select: { proposingTeamId: true, receivingTeamId: true } })
    if (!offer) return NextResponse.json({ error: "Trade offer not found" }, { status: 404 })
    // Only the receiving team may accept/reject; only the proposer may cancel. Commissioners can act on any offer.
    const allowedTeam = body.action === "CANCEL" ? offer.proposingTeamId : offer.receivingTeamId
    if (session.teamId !== allowedTeam && !session.isCommissioner) return NextResponse.json({ error: "You are not allowed to do that with this trade" }, { status: 403 })
    if (body.action === "ACCEPT") return NextResponse.json({ offer: await executeTrade(body.tradeOfferId) })
    const status = body.action === "REJECT" ? TradeStatus.REJECTED : TradeStatus.CANCELLED
    const result = await prisma.tradeOffer.updateMany({ where: { id: body.tradeOfferId, status: TradeStatus.PENDING }, data: { status } })
    if (result.count !== 1) return NextResponse.json({ error: "Pending trade offer not found" }, { status: 404 })
    return NextResponse.json({ success: true, status })
  } catch (error: unknown) {
    console.error("Trade update failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Trade update failed" }, { status: 400 })
  }
}
