export type LineupLockMode = "WEEKLY" | "DAILY"

export const LINEUP_LOCK_MODES: readonly LineupLockMode[] = ["WEEKLY", "DAILY"]
export const STARTER_SLOTS = ["C", "W", "F", "D", "G"] as const

export function normalizeLockMode(value: unknown): LineupLockMode {
  return value === "DAILY" ? "DAILY" : "WEEKLY"
}

export function isStarterSlot(slot: string): boolean {
  return (STARTER_SLOTS as readonly string[]).includes(slot)
}

export interface LockContext {
  mode: LineupLockMode
  /** WEEKLY: the first NHL game of the current fantasy week has started. */
  weekStarted: boolean
  /** DAILY: NHL team abbreviations whose game today has already started. */
  startedTeams: ReadonlySet<string>
}

/**
 * WEEKLY: starters (C/W/F/D/G) are frozen from the first puck drop of the fantasy week until the week rolls over.
 *         Bench, IR and taxi stay movable.
 * DAILY:  a player is frozen while his own team's game today has started (any slot).
 */
export function isSlotLocked(ctx: LockContext, slot: string, teamAbbrev: string): boolean {
  if (ctx.mode === "WEEKLY") return ctx.weekStarted && isStarterSlot(slot)
  return ctx.startedTeams.has(teamAbbrev)
}

/** First game of the week has started, given every game's start time in the week. */
export function hasWeekStarted(gameStartTimes: Date[], now: Date = new Date()): boolean {
  return gameStartTimes.some((start) => start.getTime() <= now.getTime())
}
