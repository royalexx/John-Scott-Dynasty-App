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

/** Copies the live roster into the week snapshot once. Later trades do not rewrite it. */
export async function freezeWeekLineup(db: Db, leagueId: string, season: number, week: number) {
  const [teamCount, frozenTeams] = await Promise.all([
    db.team.count({ where: { leagueId } }),
    db.weekLineup.findMany({
      where: { season, week, team: { leagueId } },
      distinct: ["teamId"],
      select: { teamId: true },
    }),
  ])
  if (frozenTeams.length >= teamCount) return

  const covered = new Set(frozenTeams.map((row) => row.teamId))
  const slots = await db.rosterSlot.findMany({
    where: { team: { leagueId } },
    select: { teamId: true, playerId: true, slot: true },
  })
  const missing = slots.filter((slot) => !covered.has(slot.teamId))
  if (missing.length === 0) return
  await db.weekLineup.createMany({
    data: missing.map((slot) => ({ teamId: slot.teamId, season, week, playerId: slot.playerId, slot: slot.slot })),
    skipDuplicates: true,
  })
}

export async function weekLineupForLeague(leagueId: string, season: number, week: number, now: Date = new Date()) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { lineupLockMode: true } })
  const lock = await getLockSummary(season, league?.lineupLockMode, now)
  const lockedWeek = lock.mode === "WEEKLY" && week === lock.week && lock.weekStarted
  if (lockedWeek) await freezeWeekLineup(prisma, leagueId, season, week)

  const snapshot = await prisma.weekLineup.findMany({
    where: { season, week, team: { leagueId } },
    select: { slot: true, playerId: true, team: { select: { name: true } } },
  })
  const pastWeek = week < lock.week
  const frozen = snapshot.length > 0 || pastWeek || lockedWeek
  if (snapshot.length > 0) {
    return {
      week,
      currentWeek: lock.week,
      frozen: true,
      assignments: snapshot.map((row) => ({ teamName: row.team.name, nhlId: row.playerId, slot: row.slot })),
    }
  }
  const live = await prisma.rosterSlot.findMany({
    where: { team: { leagueId } },
    select: { slot: true, playerId: true, team: { select: { name: true } } },
  })
  return {
    week,
    currentWeek: lock.week,
    frozen,
    assignments: live.map((row) => ({ teamName: row.team.name, nhlId: row.playerId, slot: row.slot })),
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
