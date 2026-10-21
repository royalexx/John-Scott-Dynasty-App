import { getCurrentFantasyWeek, getEasternDate, getFantasyWeekDates, getFantasyWeekForDate } from "@/lib/season-calendar"
import { isWeekFinal } from "@/lib/matchup-scoring"

const EASTERN = "America/New_York"

export const WAIVER_RESOLUTIONS = {
  WON: "WON",
  OUTBID: "OUTBID",
  INSUFFICIENT_FAAB: "INSUFFICIENT_FAAB",
  ROSTER_FULL: "ROSTER_FULL",
  ALREADY_ROSTERED: "ALREADY_ROSTERED",
  DROP_MISSING: "DROP_MISSING",
} as const

/** Monday 00:00 America/New_York on the calendar day after this week's Sunday. */
export function mondayMidnightAfter(weekEndDate: string): Date {
  const [year, month, day] = weekEndDate.split("-").map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  const monday = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`
  return easternMidnight(monday)
}

/** When a claim submitted at `now` will be processed: the Monday midnight that ends the current fantasy week. */
export function nextWaiverProcessAt(season: number, now: Date = new Date()): Date {
  const week = getCurrentFantasyWeek(season, now)
  return mondayMidnightAfter(getFantasyWeekDates(week, season).endDate)
}

/**
 * The Monday midnight that should clear this claim, and the fantasy week whose games must be final.
 * New claims store that Monday midnight. Older claims stored the moment they were submitted.
 */
export function runInstantForProcessDate(season: number, processDate: Date): { week: number; runAt: Date } {
  const containing = getFantasyWeekForDate(getEasternDate(processDate), season)
  const opened = easternMidnight(getFantasyWeekDates(containing, season).startDate)
  const closesPreviousWeek = Math.abs(processDate.getTime() - opened.getTime()) < 5 * 60 * 1000
  const week = closesPreviousWeek ? containing - 1 : containing
  const { endDate } = getFantasyWeekDates(Math.max(week, 1), season)
  return { week, runAt: mondayMidnightAfter(endDate) }
}

/** Midnight for `week` has passed, and every NHL game that week is finished. An empty schedule waits. */
export function waiverRunReadyForWeek(season: number, week: number, gameStates: string[], now: Date = new Date()): { ready: true; week: number } | { ready: false; reason: string } {
  if (week < 1) return { ready: false, reason: "Waivers run Monday at midnight, after the final game of the week." }
  const { endDate } = getFantasyWeekDates(week, season)
  if (now.getTime() < mondayMidnightAfter(endDate).getTime()) {
    return { ready: false, reason: "Waivers run Monday at midnight, after the final game of the week." }
  }
  if (!isWeekFinal(endDate, getEasternDate(now), gameStates)) {
    return { ready: false, reason: "Waiting for the final game of the week." }
  }
  return { ready: true, week }
}

/** Start of the current fantasy week, which is also the instant the previous week's waivers were due. */
export function currentWeekOpenedAt(season: number, now: Date = new Date()): Date {
  const { startDate } = getFantasyWeekDates(getCurrentFantasyWeek(season, now), season)
  return easternMidnight(startDate)
}

const RESOLUTION_LABELS: Record<string, string> = {
  [WAIVER_RESOLUTIONS.WON]: "Won",
  [WAIVER_RESOLUTIONS.OUTBID]: "Outbid",
  [WAIVER_RESOLUTIONS.INSUFFICIENT_FAAB]: "Not enough FAAB",
  [WAIVER_RESOLUTIONS.ROSTER_FULL]: "No open roster spot",
  [WAIVER_RESOLUTIONS.ALREADY_ROSTERED]: "Already rostered",
  [WAIVER_RESOLUTIONS.DROP_MISSING]: "Drop is no longer on your roster",
}

const WON_STATUSES = new Set(["SUCCESSFUL", "won"])
const FAILED_STATUSES = new Set(["FAILED", "failed"])

export function waiverOutcomeLabel(status: string, resolution?: string | null): string | null {
  if (resolution && resolution in RESOLUTION_LABELS) return RESOLUTION_LABELS[resolution]
  if (WON_STATUSES.has(status)) return "Won"
  if (FAILED_STATUSES.has(status)) return "Not awarded"
  return null
}

function easternOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour") % 24, value("minute"), value("second"))
  return asUtc - instant.getTime()
}

function easternMidnight(date: string): Date {
  const [year, month, day] = date.split("-").map(Number)
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const first = new Date(utcGuess.getTime() - easternOffsetMs(utcGuess))
  return new Date(utcGuess.getTime() - easternOffsetMs(first))
}
