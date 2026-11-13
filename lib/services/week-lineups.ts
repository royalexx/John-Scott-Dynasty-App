import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getLockSummary } from "@/lib/services/lineup-locks"
import { getCurrentFantasyWeek } from "@/lib/season-calendar"
import { activateDueLineupPlans, rosterMatchesPlan } from "@/lib/services/future-lineup-plans"
import type { MatchupResult } from "@/lib/dashboard-data"

type TransactionClient = Prisma.TransactionClient
type Db = TransactionClient | typeof prisma

export interface WeekAssignment {
  teamName: string
  nhlId: number
  slot: string
}

export interface WeekLineupView {
  week: number
  currentWeek: number
  source: "snapshot" | "live" | "plan" | "unavailable"
  locked: boolean
  /** True when the week is locked or a snapshot exists. Kept so older clients still treat either case as frozen. */
  frozen: boolean
  assignments: WeekAssignment[]
  matchupResults: MatchupResult[]
}

/** Snapshots the current week only. Never manufacture history from today's roster. */
export async function freezeWeekLineup(db: Db, leagueId: string, season: number, week: number, now: Date = new Date()) {
  if (week !== getCurrentFantasyWeek(season, now)) {
    throw new Error("Only the current fantasy week can be frozen from the live roster")
  }
  const slots = await db.rosterSlot.findMany({
    where: { team: { leagueId } },
    select: { teamId: true, playerId: true, slot: true },
  })
  const teamsWithSlots = [...new Set(slots.map((slot) => slot.teamId))]
  if (teamsWithSlots.length === 0) return

  const coveredTeams = await db.weekLineup.findMany({
    where: { season, week, teamId: { in: teamsWithSlots } },
    distinct: ["teamId"],
    select: { teamId: true },
  })
  const covered = new Set(coveredTeams.map((row) => row.teamId))
  const missingTeamIds = new Set(teamsWithSlots.filter((teamId) => !covered.has(teamId)))
  if (missingTeamIds.size === 0) return

  await db.weekLineup.createMany({
    data: slots
      .filter((slot) => missingTeamIds.has(slot.teamId))
      .map((slot) => ({ teamId: slot.teamId, season, week, playerId: slot.playerId, slot: slot.slot })),
    skipDuplicates: true,
  })
}

/** Every matchup participant must have a recorded lineup, not just one team. */
export function missingSnapshotTeamIds(requiredTeamIds: readonly string[], rows: readonly { teamId: string }[]): string[] {
  const covered = new Set(rows.map((row) => row.teamId))
  return [...new Set(requiredTeamIds)].filter((teamId) => !covered.has(teamId))
}

async function matchupResultsForWeek(leagueId: string, season: number, week: number): Promise<MatchupResult[]> {
  const rows = await prisma.matchup.findMany({
    where: { leagueId, season, week },
    select: {
      homeScore: true, awayScore: true, isFinal: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
    },
  })
  return rows.map((row) => ({
    week, homeTeam: row.homeTeam.name, awayTeam: row.awayTeam.name,
    homeScore: Number(row.homeScore ?? 0), awayScore: Number(row.awayScore ?? 0), isFinal: row.isFinal,
  }))
}

export async function weekLineupForLeague(leagueId: string, season: number, week: number, now: Date = new Date()): Promise<WeekLineupView> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { lineupLockMode: true } })
  const lock = await getLockSummary(season, league?.lineupLockMode, now)
  // At Monday rollover, activate already-saved future plans before the first puck
  // drop. Once a game starts, late plans are never applied retroactively.
  if (week === lock.week) await activateDueLineupPlans(leagueId, season, now)
  if (week > lock.week) {
    const [live, plans] = await Promise.all([
      prisma.rosterSlot.findMany({
        where: { team: { leagueId } },
        select: { teamId: true, playerId: true, slot: true, team: { select: { name: true } } },
      }),
      prisma.lineupPlan.findMany({
        where: { season, week, status: "PENDING", team: { leagueId } },
        include: { entries: true },
      }),
    ])
    const byTeam = new Map(plans.map((plan) => [plan.teamId, plan]))
    const liveByTeam = new Map<string, typeof live>()
    for (const row of live) liveByTeam.set(row.teamId, [...(liveByTeam.get(row.teamId) ?? []), row])
    const assignments: WeekAssignment[] = []
    let hasPlan = false
    for (const [teamId, roster] of liveByTeam) {
      const plan = byTeam.get(teamId)
      const valid = plan && rosterMatchesPlan(roster, plan.entries)
      if (valid) hasPlan = true
      const selected = valid
        ? plan.entries.map((entry) => ({ playerId: entry.playerId, slot: entry.slot, team: roster[0].team }))
        : roster
      for (const row of selected) assignments.push({ teamName: row.team.name, nhlId: row.playerId, slot: row.slot })
    }
    return { week, currentWeek: lock.week, source: hasPlan ? "plan" : "live", locked: false, frozen: false, assignments,
      matchupResults: await matchupResultsForWeek(leagueId, season, week) }
  }
  const lockedWeek = lock.mode === "WEEKLY" && week === lock.week && lock.weekStarted
  if (lockedWeek) await freezeWeekLineup(prisma, leagueId, season, week, now)

  const snapshot = await prisma.weekLineup.findMany({
    where: { season, week, team: { leagueId } },
    select: { teamId: true, slot: true, playerId: true, team: { select: { name: true } } },
  })
  const pastWeek = week < lock.week
  const locked = pastWeek || lockedWeek
  const needsSnapshot = locked || snapshot.length > 0
  const teamIds = needsSnapshot
    ? (await prisma.team.findMany({ where: { leagueId }, select: { id: true } })).map((team) => team.id)
    : []
  const complete = snapshot.length > 0 && missingSnapshotTeamIds(teamIds, snapshot).length === 0
  // A missing or partial historical snapshot is unknown data, not today's roster.
  // Avoid showing today's players as if they belonged to last month's matchup.
  const source = needsSnapshot ? (complete ? "snapshot" : "unavailable") : "live"
  const rows = source === "snapshot"
    ? snapshot
    : source === "unavailable"
      ? []
      : await prisma.rosterSlot.findMany({
          where: { team: { leagueId } },
          select: { slot: true, playerId: true, team: { select: { name: true } } },
        })
  return {
    week,
    currentWeek: lock.week,
    source,
    locked,
    frozen: locked || snapshot.length > 0,
    assignments: rows.map((row) => ({ teamName: row.team.name, nhlId: row.playerId, slot: row.slot })),
    matchupResults: await matchupResultsForWeek(leagueId, season, week),
  }
}

/**
 * Starter membership is authoritative only when every matchup team has a frozen
 * lineup. Missing historical data must not be silently replaced with the current roster.
 * Returns null so callers can preserve existing persisted matchup results.
 */
export async function scoringSlotsForWeek(
  leagueId: string,
  season: number,
  week: number,
  requiredTeamIds: string[] = [],
  requireSnapshot = false,
) {
  const currentWeek = getCurrentFantasyWeek(season)
  if (week > currentWeek) return null
  const snapshot = await prisma.weekLineup.findMany({
    where: { season, week, team: { leagueId } },
    select: { teamId: true, playerId: true, slot: true },
  })
  if (requireSnapshot || week < currentWeek || snapshot.length > 0) {
    if (snapshot.length === 0 || missingSnapshotTeamIds(requiredTeamIds, snapshot).length > 0) return null
    return snapshot
  }
  return prisma.rosterSlot.findMany({
    where: { team: { leagueId } },
    select: { teamId: true, playerId: true, slot: true },
  })
}

export function isWeekLineupLocked(lock: { mode: string; week: number; weekStarted: boolean }, week: number) {
  if (week < lock.week) return true
  return lock.mode === "WEEKLY" && week === lock.week && lock.weekStarted
}

export const FUTURE_LINEUP_LOCK_MESSAGE = "This week's lineup is locked. Its frozen starters cannot be changed."
export const FUTURE_LINEUP_PREVIEW_MESSAGE = "Use a saved future-week plan. The current live roster was not changed."
