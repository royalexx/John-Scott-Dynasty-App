/**
 * Fantasy calendar: weeks run Monday to Sunday.
 * Week 1 of the 2026-27 NHL fantasy season starts on Monday 2026-09-28, so Monday 2026-10-12 is the start of week 3.
 * Add a new entry here for each following season.
 */
const WEEK_ONE_MONDAY: Record<number, string> = {
  2026: "2026-09-28",
}

export const MAX_FANTASY_WEEK = 24

const DAY_MS = 86_400_000

function weekOneStart(season: number): Date {
  const configured = WEEK_ONE_MONDAY[season]
  if (configured) return new Date(`${configured}T00:00:00Z`)
  // Fallback for seasons without an entry: the last Monday of September.
  const firstOfOctober = new Date(Date.UTC(season, 9, 1))
  const daysSinceMonday = (firstOfOctober.getUTCDay() + 6) % 7
  return new Date(firstOfOctober.getTime() - (daysSinceMonday === 0 ? 7 : daysSinceMonday) * DAY_MS)
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Calendar date (YYYY-MM-DD) in US/Eastern, which is how NHL game dates are expressed. */
export function getEasternDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now)
}

export function getFantasyWeekDates(week: number, season = 2026): {
  startDate: string
  endDate: string
  dates: string[]
} {
  const normalizedWeek = Number.isFinite(week) ? Math.max(1, Math.floor(week)) : 1
  const start = weekOneStart(season).getTime() + (normalizedWeek - 1) * 7 * DAY_MS
  const dates = Array.from({ length: 7 }, (_, index) => toDateString(new Date(start + index * DAY_MS)))
  return { startDate: dates[0], endDate: dates[6], dates }
}

/** Unclamped fantasy week for an Eastern calendar date. Values below 1 are before week 1; values above MAX_FANTASY_WEEK are after the season. */
function elapsedFantasyWeek(date: string, season: number): number {
  const elapsedDays = Math.floor((new Date(`${date}T00:00:00Z`).getTime() - weekOneStart(season).getTime()) / DAY_MS)
  return Math.floor(elapsedDays / 7) + 1
}

/** Fantasy week containing the given Eastern calendar date, clamped to [1, MAX_FANTASY_WEEK]. */
export function getFantasyWeekForDate(date: string, season = 2026): number {
  return Math.min(MAX_FANTASY_WEEK, Math.max(1, elapsedFantasyWeek(date, season)))
}

export function getCurrentFantasyWeek(season = 2026, now: Date = new Date()): number {
  return getFantasyWeekForDate(getEasternDate(now), season)
}

/** True when the raw elapsed week is past the last fantasy week of the season. */
export function isSeasonComplete(season = 2026, now: Date = new Date()): boolean {
  return elapsedFantasyWeek(getEasternDate(now), season) > MAX_FANTASY_WEEK
}
