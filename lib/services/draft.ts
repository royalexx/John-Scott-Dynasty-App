import { ActivityAction, DraftStatus, Prisma, SlotType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getLeagueStandings } from "@/lib/db/leagues"

export type DraftOrder = "LINEAR" | "SNAKE"

type DraftConfig = { startAt: Date; rounds: number; timerSeconds: number; type: DraftOrder }

export function draftOrderType(raw: unknown): DraftOrder {
  const settings = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  return settings.type === "LINEAR" ? "LINEAR" : "SNAKE"
}

export function draftConfig(raw: unknown): DraftConfig | null {
  const settings = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const startAt = new Date(String(settings.scheduledDate ?? ""))
  if (Number.isNaN(startAt.getTime())) return null
  const rounds = Math.max(1, Math.min(30, Math.floor(Number(settings.rounds ?? 5)) || 5))
  const timerSeconds = Math.max(30, Math.min(600, Math.floor(Number(settings.timerSeconds ?? 120)) || 120))
  return { startAt, rounds, timerSeconds, type: draftOrderType(settings) }
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

/** Same team order every round. Even rounds stay in `teamIds` order. */
export function linearSlots(teamIds: string[], rounds: number) {
  const slots: { pickNumber: number; round: number; slot: number; teamId: string }[] = []
  let pickNumber = 1
  for (let round = 1; round <= rounds; round += 1) {
    for (const teamId of teamIds) {
      slots.push({ pickNumber, round, slot: teamIds.indexOf(teamId), teamId })
      pickNumber += 1
    }
  }
  return slots
}

/** `slot.teamId` starts as the original team. A traded `DraftPick` moves that slot to `currentTeamId`. */
export async function buildDraftSlots(leagueId: string, season: number, teamIds: string[], rounds: number, type: DraftOrder) {
  const picks = await prisma.draftPick.findMany({ where: { leagueId, season, round: { lte: rounds } } })
  return (type === "LINEAR" ? linearSlots : snakeSlots)(teamIds, rounds).map((slot) => {
    const pick = picks.find((item) => item.round === slot.round && item.originalTeamId === slot.teamId)
    return pick ? { ...slot, teamId: pick.currentTeamId } : slot
  })
}

async function draftTeams(leagueId: string) {
  const standings = await getLeagueStandings(leagueId)
  return [...(standings ?? [])].reverse().map((row) => ({ id: row.team.id, name: row.team.name }))
}

async function draftTeamIds(leagueId: string) {
  return (await draftTeams(leagueId)).map((team) => team.id)
}

type PickOwner = { round: number; currentTeamId: string; originalTeam: { id: string; name: string } }

/** Original team for a column, using a round whose current owner holds only that pick. */
function originalTeamForColumn(column: LoadedDraft["slots"], picks: PickOwner[]) {
  for (const slot of column) {
    const matches = picks.filter((pick) => pick.round === slot.round && pick.currentTeamId === slot.teamId)
    if (matches.length === 1) return { id: matches[0].originalTeam.id, name: matches[0].originalTeam.name }
  }
  if (picks.length === 0 && column[0]) return { id: column[0].team.id, name: column[0].team.name }
  return null
}

/** Columns are original draft slots 0..N-1, even when a team traded away its round-1 pick. */
async function columnTeams(draft: LoadedDraft) {
  const count = draft.slots.reduce((max, slot) => Math.max(max, slot.slot + 1), 0)
  if (count === 0) return []
  const picks = await prisma.draftPick.findMany({
    where: { leagueId: draft.leagueId, season: draft.startAt.getUTCFullYear(), round: { lte: draft.rounds } },
    select: { round: true, currentTeamId: true, originalTeam: { select: { id: true, name: true } } },
  })
  const resolved = new Map<number, { id: string; name: string }>()
  for (let slot = 0; slot < count; slot += 1) {
    const original = originalTeamForColumn(draft.slots.filter((item) => item.slot === slot), picks)
    if (original) resolved.set(slot, original)
  }
  if (resolved.size < count) {
    const used = new Set([...resolved.values()].map((team) => team.id))
    const ordered = await draftTeams(draft.leagueId)
    for (let slot = 0; slot < count; slot += 1) {
      if (resolved.has(slot)) continue
      const team = ordered[slot]
      if (!team || used.has(team.id)) continue
      resolved.set(slot, team)
      used.add(team.id)
    }
  }
  for (const item of draft.slots.filter((slot) => slot.round === 1)) {
    if (!resolved.has(item.slot)) resolved.set(item.slot, { id: item.team.id, name: item.team.name })
  }
  return Array.from({ length: count }, (_, slot) => ({
    id: resolved.get(slot)?.id ?? `slot-${slot}`,
    name: resolved.get(slot)?.name ?? "Team",
    slot,
  }))
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

async function draftOrderFor(leagueId: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { draftSettings: true } })
  return draftOrderType(league?.draftSettings)
}

async function present(draft: LoadedDraft, teamId: string, type?: DraftOrder) {
  const queues = queuesOf(draft.queues)
  const current = draft.slots.find((slot) => slot.playerId == null) ?? null
  const teams = await columnTeams(draft)
  return {
    id: draft.id,
    type: type ?? await draftOrderFor(draft.leagueId),
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

async function presentCurrent(draft: LoadedDraft, teamId: string, type?: DraftOrder) {
  return present(await autopickIfExpired(draft), teamId, type)
}

export async function autopickDraft(leagueId: string, teamId: string) {
  const id = await requireDraft(leagueId, teamId)
  return present(await autopickIfExpired(await load(id)), teamId)
}

async function load(draftId: string) {
  return prisma.draft.findUniqueOrThrow({ where: { id: draftId }, include: draftInclude })
}

function clockExpired(draft: LoadedDraft) {
  return draft.status === DraftStatus.LIVE && !draft.paused && remainingSeconds(draft) <= 0
}

function takenPlayerIds(draft: LoadedDraft) {
  return new Set(draft.slots.flatMap((slot) => (slot.playerId == null ? [] : [slot.playerId])))
}

async function rosteredPlayerIds(tx: Prisma.TransactionClient, leagueId: string) {
  const rows = await tx.rosterSlot.findMany({ where: { leagueId }, select: { playerId: true } })
  return new Set(rows.map((row) => row.playerId))
}

/** Queue order is priority. The first id still undrafted and not rostered is the one to pick. */
async function firstQueuedPlayer(tx: Prisma.TransactionClient, draft: LoadedDraft, teamId: string, rostered: Set<number>) {
  const taken = takenPlayerIds(draft)
  for (const playerId of queuesOf(draft.queues)[teamId] ?? []) {
    if (taken.has(playerId) || rostered.has(playerId)) continue
    const player = await tx.player.findUnique({ where: { id: playerId }, select: { id: true, name: true, nhlGamesPlayed: true } })
    if (player) return player
  }
  return null
}

/** Highest NHL games played, then lowest id, among players not drafted or rostered in this league. */
async function bestAvailablePlayer(tx: Prisma.TransactionClient, draft: LoadedDraft, rostered: Set<number>) {
  const excluded = [...takenPlayerIds(draft), ...rostered]
  return tx.player.findFirst({
    where: excluded.length > 0 ? { id: { notIn: excluded } } : undefined,
    orderBy: [{ nhlGamesPlayed: "desc" }, { id: "asc" }],
    select: { id: true, name: true, nhlGamesPlayed: true },
  })
}

async function commitPick(tx: Prisma.TransactionClient, draft: LoadedDraft, slot: LoadedDraft["slots"][number], player: { id: number; name: string; nhlGamesPlayed: number }) {
  const alreadyRostered = await tx.rosterSlot.findFirst({ where: { playerId: player.id, leagueId: draft.leagueId }, select: { id: true } })
  let placement: SlotType | null = null
  if (!alreadyRostered) {
    const [league, rosterSlots] = await Promise.all([
      tx.league.findUnique({ where: { id: draft.leagueId }, select: { rosterSize: true, taxiSlots: true, taxiMaxGames: true } }),
      tx.rosterSlot.findMany({ where: { teamId: slot.teamId }, select: { slot: true } }),
    ])
    const taxiCount = rosterSlots.filter((entry) => entry.slot === SlotType.TAXI).length
    const rosterCount = rosterSlots.filter((entry) => entry.slot !== SlotType.TAXI && entry.slot !== SlotType.IR && entry.slot !== SlotType.IR_PLUS).length
    placement = league && player.nhlGamesPlayed < league.taxiMaxGames && taxiCount < league.taxiSlots
      ? SlotType.TAXI
      : league && rosterCount < league.rosterSize
        ? SlotType.BN
        : null
    if (!placement) throw new Error("Team roster is full — cannot record draft pick without an open bench or taxi slot.")
  }
  let claimed: { count: number }
  try {
    claimed = await tx.draftSlot.updateMany({
      where: { id: slot.id, playerId: null },
      data: { playerId: player.id, pickedAt: new Date() },
    })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("That player is already drafted.")
    throw error
  }
  if (claimed.count !== 1) return false
  if (placement) {
    try {
      await tx.rosterSlot.create({ data: { teamId: slot.teamId, leagueId: draft.leagueId, playerId: player.id, slot: placement } })
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("That player is already on a league roster.")
      throw error
    }
    await tx.activityLog.create({
      data: {
        leagueId: draft.leagueId,
        teamId: slot.teamId,
        action: ActivityAction.ADD,
        details: { playerId: player.id, playerName: player.name, slot: placement, pickNumber: slot.pickNumber },
      },
    })
  }
  const remaining = draft.slots.filter((item) => item.playerId == null && item.id !== slot.id)
  await tx.draft.update({
    where: { id: draft.id },
    data: remaining.length === 0
      ? { status: DraftStatus.COMPLETE, onClock: slot.pickNumber, clockStartedAt: null, paused: false }
      : { onClock: slot.pickNumber, clockStartedAt: new Date() },
  })
  return true
}

async function autopickIfExpired(draft: LoadedDraft) {
  if (!clockExpired(draft)) return draft
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.draft.findUniqueOrThrow({ where: { id: draft.id }, include: draftInclude })
    if (!clockExpired(fresh)) return fresh
    const slot = fresh.slots.find((item) => item.playerId == null)
    if (!slot) return fresh
    const rostered = await rosteredPlayerIds(tx, fresh.leagueId)
    const player = await firstQueuedPlayer(tx, fresh, slot.teamId, rostered) ?? await bestAvailablePlayer(tx, fresh, rostered)
    if (!player || !(await commitPick(tx, fresh, slot, player))) {
      return tx.draft.findUniqueOrThrow({ where: { id: draft.id }, include: draftInclude })
    }
    return tx.draft.findUniqueOrThrow({ where: { id: draft.id }, include: draftInclude })
  })
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
  const scheduled = { startAt: config.startAt.toISOString(), rounds: config.rounds, timerSeconds: config.timerSeconds, type: config.type }
  const season = config.startAt.getUTCFullYear()

  let draft = await prisma.draft.findUnique({ where: { leagueId }, include: draftInclude })
  if (!createBeforeStart) {
    return { scheduled, draft: draft ? await present(draft, teamId, config.type) : null }
  }
  const due = config.startAt.getTime() <= Date.now()
  if (!draft && (due || createBeforeStart)) {
    const teamIds = await draftTeamIds(leagueId)
    if (teamIds.length < 2) return { scheduled, draft: null }
    try {
      draft = await prisma.draft.create({
        data: {
          leagueId,
          status: due ? DraftStatus.LIVE : DraftStatus.SCHEDULED,
          rounds: config.rounds,
          timerSeconds: config.timerSeconds,
          startAt: config.startAt,
          clockStartedAt: due ? new Date() : null,
          slots: { create: await buildDraftSlots(leagueId, season, teamIds, config.rounds, config.type) },
        },
        include: draftInclude,
      })
    } catch {
      draft = await prisma.draft.findUnique({ where: { leagueId }, include: draftInclude })
    }
  }
  if (
    draft &&
    draft.status === DraftStatus.SCHEDULED &&
    draft.slots.every((slot) => slot.playerId == null) &&
    (draft.rounds !== config.rounds || draft.timerSeconds !== config.timerSeconds || draft.startAt.getTime() !== config.startAt.getTime())
  ) {
    const teamIds = await draftTeamIds(leagueId)
    if (teamIds.length >= 2) {
      const draftId = draft.id
      const slots = await buildDraftSlots(leagueId, season, teamIds, config.rounds, config.type)
      draft = await prisma.$transaction(async (tx) => {
        await tx.draftSlot.deleteMany({ where: { draftId } })
        return tx.draft.update({
          where: { id: draftId },
          data: {
            rounds: config.rounds,
            timerSeconds: config.timerSeconds,
            startAt: config.startAt,
            slots: { create: slots },
          },
          include: draftInclude,
        })
      })
    }
  }
  if (draft) draft = await promoteIfDue(draft)
  return {
    scheduled,
    draft: draft ? await present(draft, teamId, config.type) : null,
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
  if (draft.status === DraftStatus.LIVE && !draft.paused) return presentCurrent(draft, teamId)
  await prisma.draft.update({
    where: { id },
    data: { status: DraftStatus.LIVE, paused: false, pausedRemaining: null, clockStartedAt: new Date() },
  })
  return presentCurrent(await load(id), teamId)
}

export async function pauseDraft(leagueId: string, teamId: string) {
  const id = await requireDraft(leagueId, teamId)
  const draft = await load(id)
  if (draft.status !== DraftStatus.LIVE || draft.paused) throw new Error("The draft is not running.")
  await prisma.draft.update({
    where: { id },
    data: { paused: true, pausedRemaining: remainingSeconds(draft), clockStartedAt: null },
  })
  return presentCurrent(await load(id), teamId)
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
  return presentCurrent(await load(id), teamId)
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
  return presentCurrent(await load(id), teamId)
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
    const player = await tx.player.findUnique({ where: { id: playerId }, select: { id: true, name: true, nhlGamesPlayed: true } })
    if (!player) throw new Error("Player not found.")
    if (!(await commitPick(tx, draft, slot, player))) throw new Error("That pick was already made.")
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
  return presentCurrent(await load(id), teamId)
}
