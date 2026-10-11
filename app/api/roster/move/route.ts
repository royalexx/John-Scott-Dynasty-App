import { NextRequest, NextResponse } from "next/server"
import { SlotType } from "@prisma/client"
import { updateRosterPlacement } from "@/lib/services/transactions"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { teamId?: string; playerId?: number; targetSlot?: string }
    if (!body.teamId || !Number.isInteger(body.playerId) || !body.targetSlot || !Object.values(SlotType).includes(body.targetSlot as SlotType)) {
      return NextResponse.json({ error: "teamId, playerId, and a valid targetSlot are required" }, { status: 400 })
    }
    const roster = await updateRosterPlacement(body.teamId, body.playerId as number, body.targetSlot as SlotType)
    return NextResponse.json({ roster })
  } catch (error: unknown) {
    console.error("Roster move failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Roster move failed" }, { status: 400 })
  }
}
