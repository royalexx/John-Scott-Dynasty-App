import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getCurrentFantasyWeek, getEasternDate } from "@/lib/season-calendar"

type Db = Prisma.TransactionClient

/**
 * Record each player's slot at the NHL game's lock boundary.
 * Must run under the same per-team advisory lock used by roster transactions.
 * A snapshot header without any entries is authoritative (the team had no
 * players on either NHL side). Existing snapshots are never overwritten.
 *
 * Capture is strictly limited to games on the current Eastern calendar date:
 * an old game must never be reconstructed using a roster from a later day.
 */
export async function captureStartedDailyGamesForTeam(
  tx: Db, teamId: string, season: number, now: Date = new Date(),
): Promise<number> {
  const date = getEasternDate(now)
  const games = await tx.nhlGame.findMany({
    where: { gameDate: date, startTimeUTC: { lte: now }, gameState: { notIn: ["POST", "CANCELLED", "CANCELED"] } },
    select: { id: true, homeTeamAbbrev: true, awayTeamAbbrev: true },
  })
  if (games.length === 0) return 0
  const existing = await tx.dailyGameLineup.findMany({
    where: { teamId, gameId: { in: games.map((game) => game.id) } },
    select: { gameId: true },
  })
  const covered = new Set(existing.map((row) => row.gameId))
  const remaining = games.filter((game) => !covered.has(game.id))
  if (remaining.length === 0) return 0
  const roster = await tx.rosterSlot.findMany({
    where: { teamId },
    select: { playerId: true, slot: true, player: { select: { teamAbbrev: true } } },
  })
  const week = getCurrentFantasyWeek(season, now)
  for (const game of remaining) {
    const snapshot = await tx.dailyGameLineup.create({
      data: { teamId, gameId: game.id, season, week, capturedAt: now },
      select: { id: true },
    })
    const participants = new Set([game.homeTeamAbbrev, game.awayTeamAbbrev])
    const entries = roster.filter((entry) => participants.has(entry.player.teamAbbrev))
    if (entries.length > 0) {
      await tx.dailyGameLineupEntry.createMany({
        data: entries.map((entry) => ({ snapshotId: snapshot.id, playerId: entry.playerId, slot: entry.slot })),
      })
    }
  }
  return remaining.length
}

/** Cron-scoped capture of all fantasy teams after today's NHL games start. */
export async function captureStartedDailyGamesForLeague(leagueId: string, season: number, now: Date = new Date()): Promise<number> {
  const count = await prisma.nhlGame.count({
    where: { gameDate: getEasternDate(now), startTimeUTC: { lte: now }, gameState: { notIn: ["POST", "CANCELLED", "CANCELED"] } },
  })
  if (count === 0) return 0
  const teams = await prisma.team.findMany({ where: { leagueId }, select: { id: true } })
  let created = 0
  for (const team of teams) {
    created += await prisma.$transaction(async (tx: Db) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${team.id}))`
      return captureStartedDailyGamesForTeam(tx, team.id, season, now)
    })
  }
  return created
}

export function missingDailyGameCoverage(
  gameIds: readonly number[], requiredTeamIds: readonly string[], snapshots: readonly { teamId: string; gameId: number }[],
): Array<{ gameId: number; teamId: string }> {
  const found = new Set(snapshots.map((row) => `${row.gameId}:${row.teamId}`))
  return [...new Set(gameIds)].flatMap((gameId) =>
    [...new Set(requiredTeamIds)]
      .filter((teamId) => !found.has(`${gameId}:${teamId}`))
      .map((teamId) => ({ gameId, teamId })),
  )
}

/** Only score games whose complete per-team lineup provenance is present. */
export async function dailyScoringEntries(
  leagueId: string, season: number, week: number, startedGameIds: number[], teamIds: string[],
) {
  if (startedGameIds.length === 0) return []
  const snapshots = await prisma.dailyGameLineup.findMany({
    where: { season, week, gameId: { in: startedGameIds }, teamId: { in: teamIds }, team: { leagueId } },
    include: { entries: { select: { playerId: true, slot: true } } },
  })
  if (missingDailyGameCoverage(startedGameIds, teamIds, snapshots).length > 0) return null
  return snapshots.flatMap((snapshot) => snapshot.entries.map((entry) => ({
    teamId: snapshot.teamId, gameId: snapshot.gameId, playerId: entry.playerId, slot: entry.slot,
  })))
}
