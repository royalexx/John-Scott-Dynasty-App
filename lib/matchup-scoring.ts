import { scoreGameStat, type LeagueScoring, type RawGameStat } from "@/lib/scoring"
import { isStarterSlot } from "@/lib/lineup-lock"

export interface ScoringSlot { teamId: string; playerId: number; slot: string }
export interface ScoringStat extends RawGameStat { playerId: number }

/** Sums league-scored game stats for starters only (bench, taxi and IR never score). */
export function scoreTeams(slots: ScoringSlot[], stats: ScoringStat[], scoring: LeagueScoring | null | undefined): Map<string, number> {
  const teamByPlayer = new Map<number, string>()
  for (const slot of slots) if (isStarterSlot(slot.slot)) teamByPlayer.set(slot.playerId, slot.teamId)
  const totals = new Map<string, number>()
  for (const stat of stats) {
    const teamId = teamByPlayer.get(stat.playerId)
    if (!teamId) continue
    totals.set(teamId, (totals.get(teamId) ?? 0) + scoreGameStat(stat, scoring))
  }
  for (const [teamId, total] of totals) totals.set(teamId, Math.round(total * 100) / 100)
  return totals
}

/** A week is final once it has ended in US/Eastern and every NHL game in it is finished. */
export function isWeekFinal(endDate: string, today: string, gameStates: string[]): boolean {
  if (gameStates.length === 0 || endDate >= today) return false
  return gameStates.every((state) => state === "FINAL" || state === "OFF")
}
