import { NextRequest, NextResponse } from "next/server"
import { ClaimStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { submitWaiverClaim } from "@/lib/services/transactions"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId")
  if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 })
  const claims = await prisma.waiverClaim.findMany({
    where: { teamId, status: ClaimStatus.PENDING },
    include: { playerToAdd: true, playerToDrop: true },
    orderBy: [{ processDate: "asc" }, { bidAmount: "desc" }],
  })
  return NextResponse.json({ claims })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { teamId?: string; playerToAddId?: number; playerToDropId?: number | null; bidAmount?: number; processDate?: string }
    if (!body.teamId || !Number.isInteger(body.playerToAddId) || !Number.isInteger(body.bidAmount)) return NextResponse.json({ error: "teamId, playerToAddId, and bidAmount are required" }, { status: 400 })
    const claim = await submitWaiverClaim({
      teamId: body.teamId,
      playerToAddId: body.playerToAddId as number,
      playerToDropId: body.playerToDropId ?? null,
      bidAmount: body.bidAmount as number,
      processDate: body.processDate ? new Date(body.processDate) : new Date(),
    })
    return NextResponse.json({ claim }, { status: 201 })
  } catch (error: unknown) {
    console.error("Waiver claim submission failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Waiver claim submission failed" }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as { claimId?: string; teamId?: string }
    if (!body.claimId || !body.teamId) return NextResponse.json({ error: "claimId and teamId are required" }, { status: 400 })
    const result = await prisma.waiverClaim.updateMany({ where: { id: body.claimId, teamId: body.teamId, status: ClaimStatus.PENDING }, data: { status: ClaimStatus.CANCELLED } })
    if (result.count !== 1) return NextResponse.json({ error: "Pending waiver claim not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Waiver cancellation failed", error)
    return NextResponse.json({ error: "Waiver cancellation failed" }, { status: 400 })
  }
}
