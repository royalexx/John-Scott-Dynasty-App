import type { MatchupSummary } from "@/lib/hockey-data"
import { HockeyStatus } from "@/components/ui/hockey"
import { cn } from "@/lib/utils"

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase()
}

function TeamSide({
  align, name, record, score, gamesLeft, leading, isFinal,
}: {
  align: "left" | "right"
  name: string
  record: string
  score: number
  gamesLeft: number
  leading: boolean
  isFinal: boolean
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <div className={cn("flex min-w-0 items-center gap-2", align === "right" && "flex-row-reverse")}>
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface-raised text-xs font-extrabold text-text-secondary">
          {initials(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground" title={name}>{name}</p>
          <p className="truncate text-xs text-text-muted">{record}</p>
        </div>
      </div>
      <p className={cn("ui-stat-number mt-4 text-[28px] font-extrabold leading-none", leading ? "text-foreground" : "text-text-secondary")}>
        {score.toFixed(2)}
      </p>
      <p className="mt-1.5 text-xs font-semibold text-text-muted">Actual FPTS</p>
      <p className="mt-2 text-xs text-text-secondary">{isFinal ? "Completed" : `${gamesLeft} game${gamesLeft === 1 ? "" : "s"} left`}</p>
    </div>
  )
}

/** Actual scores and projected scores are separate; no invented win probability. */
export function MatchupBanner({
  summary,
  projectedHome,
  projectedAway,
  week = 1,
  homeGamesLeft,
  awayGamesLeft,
}: {
  summary: MatchupSummary
  projectedHome: number
  projectedAway: number
  week?: number
  homeGamesLeft: number
  awayGamesLeft: number
  active?: boolean
}) {
  const isFinal = summary.status === "Final"
  const homeLeading = summary.homeScore > summary.awayScore
  const awayLeading = summary.awayScore > summary.homeScore
  const live = !isFinal && /live|progress/i.test(summary.status)
  return (
    <section data-testid="matchup-scorecard" aria-label={`Week ${week} matchup`} className="flex h-full flex-col gap-4 rounded-2xl border border-border-strong bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Head to head</p>
          <h2 className="mt-0.5 text-base font-bold text-foreground">Week {week} matchup</h2>
        </div>
        <HockeyStatus label={summary.status} tone={live ? "live" : "neutral"} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 border-t border-border pt-4">
        <TeamSide align="left" name={summary.homeTeam} record={summary.homeRecord} score={summary.homeScore} gamesLeft={homeGamesLeft} leading={homeLeading} isFinal={isFinal} />
        <span aria-hidden="true" className="pt-12 text-xs font-bold uppercase text-text-muted">vs</span>
        <TeamSide align="right" name={summary.awayTeam} record={summary.awayRecord} score={summary.awayScore} gamesLeft={awayGamesLeft} leading={awayLeading} isFinal={isFinal} />
      </div>

      <p className="rounded-xl border border-border bg-background px-3 py-2.5 text-center text-sm font-semibold text-text-secondary">
        Projected points: <span className="ui-stat-number text-foreground">{projectedHome.toFixed(1)} – {projectedAway.toFixed(1)}</span>
      </p>
    </section>
  )
}
