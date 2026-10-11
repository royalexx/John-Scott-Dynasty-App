import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { processWaiversForLeague } from "@/lib/services/transactions"

export const runtime = "nodejs"

async function run(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET
  const authorization = (await headers()).get("authorization")
  const authorized = authorization === `Bearer ${configuredSecret}` || request.nextUrl.searchParams.get("secret") === configuredSecret || process.env.NODE_ENV === "development"
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const leagueId = request.nextUrl.searchParams.get("leagueId")
  const leagues = leagueId ? [{ id: leagueId }] : await prisma.league.findMany({ select: { id: true } })
  const processed = []
  for (const league of leagues) processed.push({ leagueId: league.id, count: await processWaiversForLeague(league.id) })
  return NextResponse.json({ success: true, processed })
}

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}
