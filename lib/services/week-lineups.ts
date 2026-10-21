import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getLockSummary } from "@/lib/services/lineup-locks"

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
  source: "snapshot" | "live"
  locked: boolean
  /** True when the week is locked or a snapshot exists. Kept so older clients still treat either case as frozen. */
  frozen: boolean
  assignments: WeekAssignment[]
}

/** Copies each team's live roster into the week snapshot once. A team that already has rows is left unchanged. */
export async function freezeWeekLineup(db: Db, leagueId: string, season: number, week: number) {
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

export async function weekLineupForLeague(leagueId: string, season: number, week: number, now: Date = new Date()): Promise<WeekLineupView> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { lineupLockMode: true } })
  const lock = await getLockSummary(season, league?.lineupLockMode, now)
  const lockedWeek = lock.mode === "WEEKLY" && week === lock.week && lock.weekStarted
  if (lockedWeek) await freezeWeekLineup(prisma, leagueId, season, week)

  const snapshot = await prisma.weekLineup.findMany({
    where: { season, week, team: { leagueId } },
    select: { slot: true, playerId: true, team: { select: { name: true } } },
  })
  const pastWeek = week < lock.week
  const locked = pastWeek || lockedWeek
  const hasSnapshot = snapshot.length > 0
  const rows = hasSnapshot
    ? snapshot
    : await prisma.rosterSlot.findMany({
        where: { team: { leagueId } },
        select: { slot: true, playerId: true, team: { select: { name: true } } },
      })
  return {
    week,
    currentWeek: lock.week,
    source: hasSnapshot ? "snapshot" : "live",
    locked,
    frozen: locked || hasSnapshot,
    assignments: rows.map((row) => ({ teamName: row.team.name, nhlId: row.playerId, slot: row.slot })),
  }
}

/** Starter rows used to score a week. A frozen snapshot wins over the live roster. */
export async function scoringSlotsForWeek(leagueId: string, season: number, week: number) {
  const snapshot = await prisma.weekLineup.findMany({
    where: { season, week, team: { leagueId } },
    select: { teamId: true, playerId: true, slot: true },
  })
  if (snapshot.length > 0) return snapshot
  return prisma.rosterSlot.findMany({
    where: { team: { leagueId } },
    select: { teamId: true, playerId: true, slot: true },
  })
}

export function isWeekLineupLocked(lock: { mode: string; week: number; weekStarted: boolean }, week: number) {
  if (week < lock.week) return true
  return lock.mode === "WEEKLY" && week === lock.week && lock.weekStarted
}

export const FUTURE_LINEUP_LOCK_MESSAGE = "This week's lineup is locked. Switch to a later week to slot players from a trade."
