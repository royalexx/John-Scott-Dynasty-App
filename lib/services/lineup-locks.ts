import { prisma } from "@/lib/prisma"
import { getCurrentFantasyWeek, getEasternDate, getFantasyWeekDates } from "@/lib/season-calendar"
import { hasWeekStarted, normalizeLockMode, type LineupLockMode, type LockContext } from "@/lib/lineup-lock"

export interface LockSummary extends LockContext {
  week: number
  /** First puck drop of the fantasy week (ISO), if the schedule is known. */
  firstGameAt: string | null
  weekEndDate: string
  /** WEEKLY: the fantasy week has started. DAILY: at least one NHL team has started today. */
  locked: boolean
}

/** Computes the live lock state for a league at `now` straight from the NHL schedule (no cron needed). */
export async function getLockSummary(season: number, rawMode: unknown, now: Date = new Date()): Promise<LockSummary> {
  const mode: LineupLockMode = normalizeLockMode(rawMode)
  const week = getCurrentFantasyWeek(season, now)
  const { dates, endDate } = getFantasyWeekDates(week, season)

  if (mode === "WEEKLY") {
    const weekGames = await prisma.nhlGame.findMany({
      where: { gameDate: { in: dates } },
      select: { startTimeUTC: true },
      orderBy: { startTimeUTC: "asc" },
    })
    const starts = weekGames.map((game) => game.startTimeUTC)
    const weekStarted = hasWeekStarted(starts, now)
    return {
      mode, week, weekEndDate: endDate,
      firstGameAt: starts[0]?.toISOString() ?? null,
      weekStarted,
      startedTeams: new Set(),
      locked: weekStarted,
    }
  }

  const startedToday = await prisma.nhlGame.findMany({
    where: { gameDate: getEasternDate(now), startTimeUTC: { lte: now } },
    select: { homeTeamAbbrev: true, awayTeamAbbrev: true },
  })
  const startedTeams = new Set(startedToday.flatMap((game) => [game.homeTeamAbbrev, game.awayTeamAbbrev]))
  return {
    mode, week, weekEndDate: endDate, firstGameAt: null, weekStarted: false,
    startedTeams,
    locked: startedTeams.size > 0,
  }
}
