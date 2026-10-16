import type { MatchupSummary } from "@/lib/hockey-data"

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
}) {
  const totalProjection = projectedHome + projectedAway
  const homeWinPct = totalProjection === 0 ? 50 : Math.round((projectedHome / totalProjection) * 100)
  const awayWinPct = 100 - homeWinPct
  const homeWinning = summary.homeScore >= summary.awayScore
  const isFinal = summary.status === "Final"
  const gamesLeft = (count: number) => count === 1 ? "1 game left" : `${count} games left`

  return (
    <div className="border-y border-[#183047] bg-[#0b1c2d] px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#aeb4ff]">Week {week}</span>
        <span className={isFinal ? "rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold text-zinc-400" : "flex items-center gap-1.5 rounded-full bg-[#2b6b54]/30 px-2.5 py-0.5 text-xs font-semibold text-[#64dbad]"}>
          {!isFinal && <span className="size-1.5 animate-pulse rounded-full bg-lime-400" aria-hidden="true" />}
          {summary.status}
        </span>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-bold ${homeWinning ? "text-white" : "text-zinc-400"}`}>{summary.homeTeam}</p>
          <p className="truncate text-[13px] text-zinc-500">{summary.homeRecord}</p>
          <p className={`mt-2 text-2xl font-black tabular-nums ${homeWinning ? "text-white" : "text-zinc-300"}`}>{summary.homeScore.toFixed(2)}</p>
          <p className="mt-0.5 text-[13px] text-[#8ba0c7]">{gamesLeft(homeGamesLeft)}</p>
        </div>
        <span className="pt-7 text-sm font-medium text-zinc-500">vs</span>
        <div className="min-w-0 flex-1 text-right">
          <p className={`truncate text-sm font-bold ${!homeWinning ? "text-white" : "text-zinc-400"}`}>{summary.awayTeam}</p>
          <p className="truncate text-[13px] text-zinc-500">{summary.awayRecord}</p>
          <p className={`mt-2 text-2xl font-black tabular-nums ${!homeWinning ? "text-white" : "text-zinc-300"}`}>{summary.awayScore.toFixed(2)}</p>
          <p className="mt-0.5 text-[13px] text-[#8ba0c7]">{gamesLeft(awayGamesLeft)}</p>
        </div>
      </div>

      <p className="mt-3 text-[13px] text-[#5e7090]">
        Projected {projectedHome.toFixed(1)} – {projectedAway.toFixed(1)}
        <span className="sr-only">{`Projected split: ${homeWinPct}% ${summary.homeTeam}, ${awayWinPct}% ${summary.awayTeam}`}</span>
      </p>
    </div>
  )
}
