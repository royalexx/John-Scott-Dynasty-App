import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import { autopickDraft, makeDraftPick, pauseDraft, readDraft, resumeDraft, setDraftTimer, startDraft, updateDraftQueue } from "@/lib/services/draft"

export const runtime = "nodejs"

async function leagueIdForSession(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leagueId: true } })
  return team?.leagueId ?? null
}

export async function GET(request: NextRequest) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const leagueId = await leagueIdForSession(session.teamId)
  if (!leagueId) return NextResponse.json({ error: "League not found." }, { status: 404 })
  const draft = await readDraft(leagueId, session.teamId, request.nextUrl.searchParams.get("ensure") === "1")
  return NextResponse.json(draft)
}

export async function POST(request: NextRequest) {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const leagueId = await leagueIdForSession(session.teamId)
  if (!leagueId) return NextResponse.json({ error: "League not found." }, { status: 404 })
  const body = await request.json().catch(() => null) as { action?: string; playerId?: number; timerSeconds?: number } | null
  if (!body?.action) return NextResponse.json({ error: "action is required" }, { status: 400 })
  const commissionerAction = body.action === "start" || body.action === "pause" || body.action === "resume" || body.action === "timer"
  if (commissionerAction && !session.isCommissioner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    if (body.action === "start") return NextResponse.json({ draft: await startDraft(leagueId, session.teamId) })
    if (body.action === "pause") return NextResponse.json({ draft: await pauseDraft(leagueId, session.teamId) })
    if (body.action === "resume") return NextResponse.json({ draft: await resumeDraft(leagueId, session.teamId) })
    if (body.action === "timer") {
      if (!Number.isInteger(body.timerSeconds)) return NextResponse.json({ error: "timerSeconds is required" }, { status: 400 })
      return NextResponse.json({ draft: await setDraftTimer(leagueId, session.teamId, body.timerSeconds as number) })
    }
    if (body.action === "autopick") return NextResponse.json({ draft: await autopickDraft(leagueId, session.teamId) })
    if (body.action === "pick") {
      if (!Number.isInteger(body.playerId)) return NextResponse.json({ error: "playerId is required" }, { status: 400 })
      return NextResponse.json({ draft: await makeDraftPick(leagueId, session.teamId, body.playerId as number, session.isCommissioner) })
    }
    if (body.action === "queue-add" || body.action === "queue-remove") {
      if (!Number.isInteger(body.playerId)) return NextResponse.json({ error: "playerId is required" }, { status: 400 })
      return NextResponse.json({ draft: await updateDraftQueue(leagueId, session.teamId, body.playerId as number, body.action === "queue-add") })
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft action failed" }, { status: 400 })
  }
}
