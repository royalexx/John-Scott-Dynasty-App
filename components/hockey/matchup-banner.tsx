import type { MatchupSummary } from "@/lib/hockey-data"
import { cn } from "@/lib/utils"

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase()
}

function gamesLeftLabel(count: number) {
  return count === 1 ? "1 game left" : `${count} games left`
}

function TeamSide({
  align,
  name,
  record,
  score,
  gamesLeft,
  winning,
  active,
}: {
  align: "left" | "right"
  name: string
  record: string
  score: number
  gamesLeft: number
  winning: boolean
  active: boolean
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <div className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse")}>
        <div aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#172338] text-[11px] font-black text-white">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <p className={cn("truncate text-sm font-bold", winning ? "text-white" : "text-zinc-400")}>{name}</p>
          <p className="truncate text-[12px] text-zinc-500">{record}</p>
        </div>
      </div>
      <p className={cn("mt-2 font-black tabular-nums leading-8", active ? "text-2xl" : "text-[1.5rem]", winning ? "text-white" : "text-zinc-300")}>
        {score.toFixed(2)}
      </p>
      <p className="mt-1 text-[12px] text-[#8ba0c7]">{gamesLeftLabel(gamesLeft)}</p>
    </div>
  )
}

export function MatchupBanner({
  summary,
  projectedHome,
  projectedAway,
  week = 1,
  homeGamesLeft,
  awayGamesLeft,
  active = true,
}: {
  summary: MatchupSummary
  projectedHome: number
  projectedAway: number
  week?: number
  homeGamesLeft: number
  awayGamesLeft: number
  active?: boolean
}) {
  const homeWinning = summary.homeScore >= summary.awayScore
  const isFinal = summary.status === "Final"

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#183047] bg-[#0b1c2d] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-[#aeb4ff]">Week {week}</span>
        <span className={isFinal ? "rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold text-zinc-400" : "flex items-center gap-1.5 rounded-full bg-[#2b6b54]/30 px-2.5 py-0.5 text-xs font-semibold text-[#64dbad]"}>
          {!isFinal && <span className="size-1.5 animate-pulse rounded-full bg-lime-400" aria-hidden="true" />}
          {summary.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        <TeamSide align="left" name={summary.homeTeam} record={summary.homeRecord} score={summary.homeScore} gamesLeft={homeGamesLeft} winning={homeWinning} active={active} />
        <span className="pt-8 text-xs font-semibold text-zinc-500">vs</span>
        <TeamSide align="right" name={summary.awayTeam} record={summary.awayRecord} score={summary.awayScore} gamesLeft={awayGamesLeft} winning={!homeWinning} active={active} />
      </div>

      <p className="mt-3 text-center text-[13px] text-[#5e7090]">
        Projected points: {projectedHome.toFixed(1)} – {projectedAway.toFixed(1)}
      </p>
    </div>
  )
}
