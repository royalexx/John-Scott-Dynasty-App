import type { MatchupSummary } from "@/lib/hockey-data"
import { Shield } from "lucide-react"

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
  const homeWinPct =
    totalProjection === 0 ? 50 : Math.round((projectedHome / totalProjection) * 100)
  const awayWinPct = 100 - homeWinPct
  const homeWinning = summary.homeScore >= summary.awayScore
  const isFinal = summary.status === "Final"

  return (
    <div className="border-y border-[#183047] bg-[#0b1c2d] p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#aeb4ff]">Week {week}</span>
        <span
          className={
            isFinal
              ? "rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-400"
              : "flex items-center gap-1.5 rounded-full bg-[#2b6b54]/30 px-2.5 py-0.5 text-[11px] font-semibold text-[#64dbad]"
          }
        >
          {!isFinal && <span className="size-1.5 animate-pulse rounded-full bg-lime-400" aria-hidden="true" />}
          {summary.status}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-[#19ffff]/15 text-[#19ffff]"><Shield className="size-4" /></div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{summary.homeOwner}</span>
          </div>
          <p className={`truncate text-sm font-semibold ${homeWinning ? "text-white" : "text-zinc-400"}`}>
            {summary.homeTeam}
          </p>
          <p className="truncate text-[11px] text-zinc-500">
            {summary.homeOwner} · {summary.homeRecord}
          </p>
          <p className={`text-2xl font-bold tabular-nums ${homeWinning ? "text-[#aeb4ff]" : "text-zinc-300"}`}>
            {summary.homeScore.toFixed(2)}
          </p>
          <p className="text-[11px] leading-tight text-zinc-500"><span className="block">proj</span><span className="block tabular-nums">{projectedHome.toFixed(1)}</span></p>
        </div>
        <span className="shrink-0 text-sm font-medium text-zinc-500">vs</span>
        <div className="min-w-0 flex-1 text-right">
          <div className="mb-1 flex items-center justify-end gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{summary.awayOwner}</span>
            <div className="flex size-7 items-center justify-center rounded-full bg-[#ff2a85]/15 text-[#ff2a85]"><Shield className="size-4" /></div>
          </div>
          <p className={`truncate text-sm font-semibold ${!homeWinning ? "text-white" : "text-zinc-400"}`}>
            {summary.awayTeam}
          </p>
          <p className="truncate text-[11px] text-zinc-500">
            {summary.awayOwner} · {summary.awayRecord}
          </p>
          <p className={`text-2xl font-bold tabular-nums ${!homeWinning ? "text-[#aeb4ff]" : "text-zinc-300"}`}>
            {summary.awayScore.toFixed(2)}
          </p>
          <p className="text-[11px] leading-tight text-zinc-500"><span className="block">proj</span><span className="block tabular-nums">{projectedAway.toFixed(1)}</span></p>
        </div>
      </div>

      <div className="mt-4">
        <div
          className="relative flex h-5 overflow-hidden rounded-sm bg-[#173047]"
          aria-label={`Win percentage: ${homeWinPct}% ${summary.homeTeam}, ${awayWinPct}% ${summary.awayTeam}`}
        >
          <div
            className="flex items-center justify-end bg-[#19ffff] px-2 transition-[width]"
            style={{ width: `${homeWinPct}%` }}
          />
          <div
            className="flex items-center justify-start bg-[#ff2a85] px-2 transition-[width]"
            style={{ width: `${awayWinPct}%` }}
          />
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px] font-bold tabular-nums">
          <div className="min-w-0 flex items-center gap-2">
            <span className="truncate text-[#19ffff]">{homeWinPct}% • {homeGamesLeft} left</span>
          </div>
          <div className="min-w-0 flex items-center justify-end gap-2">
            <span className="truncate text-[#ff2a85]">{awayGamesLeft} left • {awayWinPct}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
