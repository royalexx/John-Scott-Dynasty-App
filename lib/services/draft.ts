import { DraftStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getLeagueStandings } from "@/lib/db/leagues"

type DraftConfig = { startAt: Date; rounds: number; timerSeconds: number }

export function draftConfig(raw: unknown): DraftConfig | null {
  const settings = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const startAt = new Date(String(settings.scheduledDate ?? ""))
  if (Number.isNaN(startAt.getTime())) return null
  const rounds = Math.max(1, Math.min(30, Math.floor(Number(settings.rounds ?? 5)) || 5))
  const timerSeconds = Math.max(30, Math.min(600, Math.floor(Number(settings.timerSeconds ?? 120)) || 120))
  return { startAt, rounds, timerSeconds }
}

export function snakeSlots(teamIds: string[], rounds: number) {
  const slots: { pickNumber: number; round: number; slot: number; teamId: string }[] = []
  let pickNumber = 1
  for (let round = 1; round <= rounds; round += 1) {
    const order = round % 2 === 1 ? teamIds : [...teamIds].reverse()
    for (const teamId of order) {
      slots.push({ pickNumber, round, slot: teamIds.indexOf(teamId), teamId })
      pickNumber += 1
    }
  }
  return slots
}

function queuesOf(value: Prisma.JsonValue): Record<string, number[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const queues: Record<string, number[]> = {}
  for (const [teamId, ids] of Object.entries(value)) {
    if (!Array.isArray(ids)) continue
    queues[teamId] = ids.filter((id): id is number => Number.isInteger(id))
  }
  return queues
}

function remainingSeconds(draft: { status: DraftStatus; paused: boolean; pausedRemaining: number | null; timerSeconds: number; clockStartedAt: Date | null }, now = new Date()) {
  if (draft.paused) return draft.pausedRemaining ?? draft.timerSeconds
  if (draft.status !== DraftStatus.LIVE || !draft.clockStartedAt) return draft.timerSeconds
  const elapsed = Math.floor((now.getTime() - draft.clockStartedAt.getTime()) / 1000)
  return Math.max(0, draft.timerSeconds - elapsed)
}

const draftInclude = {
  slots: {
    orderBy: { pickNumber: "asc" as const },
    include: {
      team: { select: { id: true, name: true } },
      player: { select: { id: true, name: true, position: true, teamAbbrev: true } },
    },
  },
} satisfies Prisma.DraftInclude

type LoadedDraft = Prisma.DraftGetPayload<{ include: typeof draftInclude }>

function present(draft: LoadedDraft, teamId: string) {
  const queues = queuesOf(draft.queues)
  const current = draft.slots.find((slot) => slot.playerId == null) ?? null
  const teams = [...new Map(draft.slots.filter((slot) => slot.round === 1).sort((a, b) => a.slot - b.slot).map((slot) => [slot.teamId, { id: slot.team.id, name: slot.team.name, slot: slot.slot }])).values()]
  return {
    id: draft.id,
    status: draft.status,
    rounds: draft.rounds,
    timerSeconds: draft.timerSeconds,
    startAt: draft.startAt.toISOString(),
    onClock: draft.onClock,
    paused: draft.paused,
    remainingSeconds: remainingSeconds(draft),
    yourTurn: current?.teamId === teamId && draft.status === DraftStatus.LIVE && !draft.paused,
    onClockTeamId: current?.teamId ?? null,
    teams,
    queue: queues[teamId] ?? [],
    slots: draft.slots.map((slot) => ({
      pickNumber: slot.pickNumber,
      round: slot.round,
      slot: slot.slot,
      teamId: slot.teamId,
      teamName: slot.team.name,
      playerId: slot.playerId,
      playerName: slot.player?.name ?? null,
      position: slot.player?.position ?? null,
      nhlTeam: slot.player?.teamAbbrev ?? null,
    })),
  }
}

async function load(draftId: string) {
  return prisma.draft.findUniqueOrThrow({ where: { id: draftId }, include: draftInclude })
}

async function promoteIfDue(draft: LoadedDraft) {
  if (draft.status !== DraftStatus.SCHEDULED || draft.startAt.getTime() > Date.now()) return draft
  await prisma.draft.update({
    where: { id: draft.id },
    data: { status: DraftStatus.LIVE, clockStartedAt: new Date(), paused: false, pausedRemaining: null },
  })
  return load(draft.id)
}

export async function readDraft(leagueId: string, teamId: string, createBeforeStart: boolean) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { draftSettings: true } })
  const config = draftConfig(league?.draftSettings)
  if (!config) return { scheduled: null, draft: null }

  let draft = await prisma.draft.findUnique({ where: { leagueId }, include: draftInclude })
  const due = config.startAt.getTime() <= Date.now()
  if (!draft && (due || createBeforeStart)) {
    const standings = await getLeagueStandings(leagueId)
    const teamIds = [...(standings ?? [])].reverse().map((row) => row.team.id)
    if (teamIds.length < 2) return { scheduled: { startAt: config.startAt.toISOString(), rounds: config.rounds, timerSeconds: config.timerSeconds }, draft: null }
    try {
      draft = await prisma.draft.create({
        data: {
          leagueId,
          status: due ? DraftStatus.LIVE : DraftStatus.SCHEDULED,
          rounds: config.rounds,
          timerSeconds: config.timerSeconds,
          startAt: config.startAt,
          clockStartedAt: due ? new Date() : null,
          slots: { create: snakeSlots(teamIds, config.rounds) },
        },
        include: draftInclude,
      })
    } catch {
      draft = await prisma.draft.findUnique({ where: { leagueId }, include: draftInclude })
    }
  }
  if (draft) draft = await promoteIfDue(draft)
  return {
    scheduled: { startAt: config.startAt.toISOString(), rounds: config.rounds, timerSeconds: config.timerSeconds },
    draft: draft ? present(draft, teamId) : null,
  }
}

async function requireDraft(leagueId: string, teamId: string) {
  const view = await readDraft(leagueId, teamId, true)
  if (!view.draft) throw new Error("No draft is scheduled.")
  return view.draft.id
}

export async function startDraft(leagueId: string, teamId: string) {
  const id = await requireDraft(leagueId, teamId)
  const draft = await load(id)
  if (draft.status === DraftStatus.COMPLETE) throw new Error("The draft is complete.")
  if (draft.status === DraftStatus.LIVE && !draft.paused) return present(draft, teamId)
  await prisma.draft.update({
    where: { id },
    data: { status: DraftStatus.LIVE, paused: false, pausedRemaining: null, clockStartedAt: new Date() },
  })
  return present(await load(id), teamId)
}

export async function pauseDraft(leagueId: string, teamId: string) {
  const id = await requireDraft(leagueId, teamId)
  const draft = await load(id)
  if (draft.status !== DraftStatus.LIVE || draft.paused) throw new Error("The draft is not running.")
  await prisma.draft.update({
    where: { id },
    data: { paused: true, pausedRemaining: remainingSeconds(draft), clockStartedAt: null },
  })
  return present(await load(id), teamId)
}

export async function resumeDraft(leagueId: string, teamId: string) {
  const id = await requireDraft(leagueId, teamId)
  const draft = await load(id)
  if (!draft.paused) throw new Error("The draft is not paused.")
  const remaining = draft.pausedRemaining ?? draft.timerSeconds
  const elapsed = Math.max(0, draft.timerSeconds - remaining)
  await prisma.draft.update({
    where: { id },
    data: { paused: false, pausedRemaining: null, status: DraftStatus.LIVE, clockStartedAt: new Date(Date.now() - elapsed * 1000) },
  })
  return present(await load(id), teamId)
}

export async function setDraftTimer(leagueId: string, teamId: string, timerSeconds: number) {
  const id = await requireDraft(leagueId, teamId)
  const seconds = Math.max(30, Math.min(600, Math.floor(timerSeconds)))
  const draft = await load(id)
  await prisma.draft.update({
    where: { id },
    data: {
      timerSeconds: seconds,
      pausedRemaining: draft.paused ? seconds : null,
      clockStartedAt: draft.status === DraftStatus.LIVE && !draft.paused ? new Date() : draft.clockStartedAt,
    },
  })
  return present(await load(id), teamId)
}

export async function makeDraftPick(leagueId: string, teamId: string, playerId: number, commissioner: boolean) {
  const id = await requireDraft(leagueId, teamId)
  return prisma.$transaction(async (tx) => {
    const draft = await tx.draft.findUniqueOrThrow({ where: { id }, include: draftInclude })
    if (draft.status !== DraftStatus.LIVE || draft.paused) throw new Error("The draft is not accepting picks.")
    const slot = draft.slots.find((item) => item.playerId == null)
    if (!slot) throw new Error("The draft is complete.")
    if (slot.teamId !== teamId && !commissioner) throw new Error("It is not your pick.")
    const taken = draft.slots.some((item) => item.playerId === playerId)
    if (taken) throw new Error("That player is already drafted.")
    const player = await tx.player.findUnique({ where: { id: playerId }, select: { id: true } })
    if (!player) throw new Error("Player not found.")
    await tx.draftSlot.update({ where: { id: slot.id }, data: { playerId, pickedAt: new Date() } })
    const remaining = draft.slots.filter((item) => item.playerId == null && item.id !== slot.id)
    await tx.draft.update({
      where: { id },
      data: remaining.length === 0
        ? { status: DraftStatus.COMPLETE, onClock: slot.pickNumber, clockStartedAt: null, paused: false }
        : { onClock: slot.pickNumber, clockStartedAt: new Date() },
    })
    return present(await tx.draft.findUniqueOrThrow({ where: { id }, include: draftInclude }), teamId)
  })
}

export async function updateDraftQueue(leagueId: string, teamId: string, playerId: number, add: boolean) {
  const id = await requireDraft(leagueId, teamId)
  const draft = await load(id)
  const queues = queuesOf(draft.queues)
  const current = queues[teamId] ?? []
  queues[teamId] = add ? [...current.filter((id) => id !== playerId), playerId] : current.filter((id) => id !== playerId)
  await prisma.draft.update({ where: { id }, data: { queues } })
  return present(await load(id), teamId)
}
