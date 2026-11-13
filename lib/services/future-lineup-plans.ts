import { PlayerStatus, Prisma, SlotType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getCurrentFantasyWeek, getFantasyWeekDates, MAX_FANTASY_WEEK } from "@/lib/season-calendar"
import { countActiveRosterSlots, DEFAULT_BENCH_CAPACITY, displacedLandingSlot, positionFitsSlot } from "@/lib/roster-eligibility"

type Db = Prisma.TransactionClient
type PlayerForPlan = { position: string; injuryStatus: PlayerStatus; nhlGamesPlayed: number; name: string }
export type PlannedAssignment = { playerId: number; slot: SlotType }
type RosterEntry = PlannedAssignment & { player: PlayerForPlan }
type RosterLimits = { rosterPositions: Prisma.JsonValue; rosterSize: number; taxiSlots: number; irSlots: number; taxiMaxGames: number }

function capacity(limits: RosterLimits, slot: SlotType): number {
  if (slot === SlotType.TAXI) return limits.taxiSlots
  if (slot === SlotType.IR) return limits.irSlots
  if (slot === SlotType.IR_PLUS) return 0
  const positions = (limits.rosterPositions ?? {}) as Record<string, number>
  return slot === SlotType.BN ? positions.BN ?? DEFAULT_BENCH_CAPACITY : positions[slot] ?? 0
}

function eligible(row: RosterEntry, slot: SlotType, limits: RosterLimits) {
  if (slot === SlotType.IR && row.player.injuryStatus !== PlayerStatus.IR) throw new Error(`${row.player.name} is not eligible for IR`)
  if (slot === SlotType.IR_PLUS) throw new Error("IR+ is disabled")
  if (slot === SlotType.TAXI && row.player.nhlGamesPlayed >= limits.taxiMaxGames) throw new Error(`${row.player.name} exceeds the taxi squad games limit`)
  if (!positionFitsSlot(slot, row.player.position)) throw new Error(`${row.player.name} cannot play ${slot}`)
}

export function validatePlannedRoster(rows: readonly RosterEntry[], limits: RosterLimits) {
  const counts = new Map<SlotType, number>()
  if (new Set(rows.map((row) => row.playerId)).size !== rows.length) throw new Error("Duplicate players in lineup plan")
  for (const row of rows) {
    eligible(row, row.slot, limits)
    counts.set(row.slot, (counts.get(row.slot) ?? 0) + 1)
  }
  for (const slot of Object.values(SlotType)) {
    const limit = capacity(limits, slot)
    if (!Number.isInteger(limit) || limit < 0 || (counts.get(slot) ?? 0) > limit) throw new Error(`${slot} exceeds its configured capacity`)
  }
  if (countActiveRosterSlots(rows) > limits.rosterSize) throw new Error("Planned lineup exceeds active roster limit")
}

export function previewFutureMove(
  roster: readonly RosterEntry[], limits: RosterLimits, playerId: number, targetSlot: SlotType, targetPlayerId?: number,
): RosterEntry[] {
  const next = roster.map((row) => ({ ...row }))
  const source = next.find((row) => row.playerId === playerId)
  if (!source) throw new Error("Player is not on this roster")
  if (source.slot === targetSlot) return next
  eligible(source, targetSlot, limits)
  const limit = capacity(limits, targetSlot)
  if (!Number.isInteger(limit) || limit <= 0) throw new Error(`${targetSlot} is not an enabled slot`)
  const occupants = next.filter((row) => row.playerId !== playerId && row.slot === targetSlot).sort((a, b) => a.playerId - b.playerId)
  let occupant = targetPlayerId == null ? undefined : next.find((row) => row.playerId === targetPlayerId)
  if (targetPlayerId != null && (!occupant || occupant.slot !== targetSlot)) throw new Error("Swap target is no longer in that slot")
  if (!occupant && occupants.length >= limit) {
    if (targetSlot === SlotType.BN) throw new Error("Bench is full. Choose a swap.")
    occupant = occupants[0]
  }
  if (occupant) {
    const otherBench = next.filter((row) => row.slot === SlotType.BN && row.playerId !== source.playerId && row.playerId !== occupant.playerId).length
    const landing = displacedLandingSlot(source.slot, occupant.player.position, otherBench < capacity(limits, SlotType.BN))
    if (!landing) throw new Error("Displaced player cannot fit in the vacated slot or the bench")
    eligible(occupant, landing as SlotType, limits)
    occupant.slot = landing as SlotType
  }
  source.slot = targetSlot
  validatePlannedRoster(next, limits)
  return next
}

export function rosterMatchesPlan(live: readonly { playerId: number }[], entries: readonly { playerId: number }[]): boolean {
  return live.length === entries.length &&
    new Set(live.map((row) => row.playerId)).size === live.length &&
    live.every((row) => entries.some((entry) => entry.playerId === row.playerId))
}

/** Save a complete planned lineup in its own tables, never writing to RosterSlot. */
export async function saveFutureLineupMove(teamId: string, week: number, playerId: number, targetSlot: SlotType, targetPlayerId?: number) {
  return prisma.$transaction(async (tx: Db) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${teamId}))`
    const team = await tx.team.findUnique({ where: { id: teamId }, include: { league: true } })
    if (!team) throw new Error("Team not found")
    const season = team.league.currentSeason
    const current = getCurrentFantasyWeek(season)
    if (!Number.isInteger(week) || week <= current || week > MAX_FANTASY_WEEK) throw new Error("Future plan must target a later week in this season")
    const live = await tx.rosterSlot.findMany({ where: { teamId }, include: { player: true }, orderBy: { playerId: "asc" } })
    if (!live.some((row) => row.playerId === playerId)) throw new Error("Player is not on this roster")
    const plan = await tx.lineupPlan.findUnique({
      where: { teamId_season_week: { teamId, season, week } }, include: { entries: true },
    })
    const prior = plan && rosterMatchesPlan(live, plan.entries) && plan.status === "PENDING"
      ? new Map(plan.entries.map((entry) => [entry.playerId, entry.slot]))
      : null
    const roster = live.map((row) => ({ playerId: row.playerId, slot: prior?.get(row.playerId) ?? row.slot, player: row.player }))
    // If roster ownership changed, a stale plan is deliberately rebased to the live roster.
    const next = previewFutureMove(roster, team.league, playerId, targetSlot, targetPlayerId)
    const saved = await tx.lineupPlan.upsert({
      where: { teamId_season_week: { teamId, season, week } },
      update: { status: "PENDING", activatedAt: null },
      create: { teamId, season, week, status: "PENDING" },
      select: { id: true },
    })
    await tx.lineupPlanEntry.deleteMany({ where: { planId: saved.id } })
    await tx.lineupPlanEntry.createMany({ data: next.map((row) => ({ planId: saved.id, playerId: row.playerId, slot: row.slot })) })
    return { season, week, assignments: next.map(({ playerId, slot }) => ({ playerId, slot })) }
  })
}

/**
 * Activate a team's saved next-week lineup before the first game of that week.
 * Never apply a plan after puck drop, or when roster membership has changed;
 * these cases retain live assignments and record a reviewable status.
 */
export async function activateDueLineupPlans(leagueId: string, season: number, now: Date = new Date()) {
  const week = getCurrentFantasyWeek(season, now)
  const pending = await prisma.lineupPlan.findMany({
    where: { season, week, status: "PENDING", team: { leagueId } },
    select: { id: true, teamId: true },
  })
  if (pending.length === 0) return { applied: 0, stale: 0, missed: 0 }
  const { dates } = getFantasyWeekDates(week, season)
  const started = await prisma.nhlGame.findFirst({
    where: { gameDate: { in: dates }, startTimeUTC: { lte: now } },
    select: { id: true },
  })
  const totals = { applied: 0, stale: 0, missed: 0 }
  for (const item of pending) {
    const outcome = await prisma.$transaction(async (tx: Db) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${item.teamId}))`
      const plan = await tx.lineupPlan.findUnique({ where: { id: item.id }, include: { entries: true, team: { include: { league: true } } } })
      if (!plan || plan.status !== "PENDING" || plan.team.league.currentSeason !== season) return null
      const snapshot = await tx.weekLineup.count({ where: { teamId: plan.teamId, season, week } })
      // Catch a game that crossed the lock boundary after the initial read.
      const lateStart = started || await tx.nhlGame.findFirst({
        where: { gameDate: { in: dates }, startTimeUTC: { lte: new Date() } },
        select: { id: true },
      })
      if (lateStart || snapshot) {
        await tx.lineupPlan.update({ where: { id: plan.id }, data: { status: "MISSED" } })
        return "missed" as const
      }
      const live = await tx.rosterSlot.findMany({ where: { teamId: plan.teamId }, include: { player: true } })
      if (!rosterMatchesPlan(live, plan.entries)) {
        await tx.lineupPlan.update({ where: { id: plan.id }, data: { status: "STALE" } })
        return "stale" as const
      }
      try {
        validatePlannedRoster(live.map((row) => ({
          playerId: row.playerId, player: row.player, slot: plan.entries.find((entry) => entry.playerId === row.playerId)!.slot,
        })), plan.team.league)
      } catch {
        await tx.lineupPlan.update({ where: { id: plan.id }, data: { status: "STALE" } })
        return "stale" as const
      }
      for (const entry of plan.entries) {
        await tx.rosterSlot.update({ where: { teamId_playerId: { teamId: plan.teamId, playerId: entry.playerId } }, data: { slot: entry.slot } })
      }
      await tx.lineupPlan.update({ where: { id: plan.id }, data: { status: "APPLIED", activatedAt: new Date() } })
      return "applied" as const
    })
    if (outcome) totals[outcome] += 1
  }
  return totals
}
