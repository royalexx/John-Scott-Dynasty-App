"use client"

import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { SwipeSurface } from "@/components/hockey/swipe-gestures"
import { getPlayerDetail, getPlayerPhoto, type MarketPlayer, type Player, type PlayerProfile, type PlayerStatus, type PlayerGameLog, type PlayerSeasonSummary, type PlayerSchedule, type NhlScheduleGame } from "@/lib/hockey-data"

const positionColor: Record<string, string> = {
  C: "text-[#60a5fa]",
  LW: "text-[#2dd4bf]",
  RW: "text-[#2dd4bf]",
  W: "text-[#2dd4bf]",
  F: "text-[#c4b5fd]",
  D: "text-[#fbbf24]",
  G: "text-[#38bdf8]",
}

export interface PlayerDialogTarget {
  name: string
  position: Player["position"]
  team: string
  opponent: string
  status: PlayerStatus
  todayPts: number | null
  projPts: number
  marketPlayer?: MarketPlayer
  profile?: PlayerProfile
  currentSeasonStats?: Record<string, number>
  gameLog?: PlayerGameLog[]
  historicalSeasons?: PlayerSeasonSummary[]
  schedule?: PlayerSchedule
  owned?: boolean
  playerId?: string
  ownerName?: string
  tradeBlockNote?: string
}

type PlayerNews = { id: string; headline: string; description: string; published: string | null; url: string | null }
type TeamStats = {
  team: string
  record: string
  points: number
  pointPct: number
  goalsForPerGame: number
  goalsAgainstPerGame: number
  offenseRank: number
  defenseRank: number
  powerPlay: number | null
  penaltyKill: number | null
}
type Tab = "summary" | "log" | "team" | "history" | "news"
type Detail = ReturnType<typeof getPlayerDetail>

const tabs: Tab[] = ["summary", "log", "team", "history", "news"]
const tabLabel: Record<Tab, string> = { summary: "Summary", log: "Log", team: "Team", history: "History", news: "News" }

export function PlayerDetailDialog({
  player, open, onOpenChange, onClaim,
  tradeBlockActive, onToggleTradeBlock, onInitiateTrade,
  scheduleGames = [],
}: {
  player: PlayerDialogTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onClaim?: (player: PlayerDialogTarget) => void
  onSelectPlayer?: (player: PlayerDialogTarget) => void
  tradeBlockActive?: boolean
  onToggleTradeBlock?: (player: PlayerDialogTarget) => void
  onInitiateTrade?: (player: PlayerDialogTarget) => void
  scheduleGames?: NhlScheduleGame[]
}) {
  const [tab, setTab] = useState<Tab>("summary")
  const [news, setNews] = useState<PlayerNews[]>([])
  useEffect(() => {
    if (!player || !open) return
    fetch(`/api/news?player=${encodeURIComponent(player.name)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { articles?: PlayerNews[] }) => setNews(data.articles ?? []))
      .catch((error) => console.error(`Failed to load ESPN news for ${player.name}:`, error))
  }, [open, player])
  const detail = useMemo(() => player ? getPlayerDetail(player, scheduleGames) : null, [player, scheduleGames])
  if (!open || !player || !detail) return null

  const goalie = player.position === "G"
  const weekPoints = player.schedule?.weekFantasyPoints
  const action = player.owned
    ? (onInitiateTrade ? { label: "Trade", run: () => { onOpenChange(false); onInitiateTrade(player) } } : null)
    : player.marketPlayer && onClaim
      ? { label: player.marketPlayer.waiver === "FA" ? "Add" : "Claim", run: () => { onOpenChange(false); onClaim(player) } }
      : onInitiateTrade
        ? { label: "Trade", run: () => { onOpenChange(false); onInitiateTrade(player) } }
        : null
  const shiftTab = (step: number) => {
    const next = tabs.indexOf(tab) + step
    if (next >= 0 && next < tabs.length) setTab(tabs[next])
  }

  return (
    <Sheet open={open} onOpenChange={(value) => { if (!value) { setTab("summary"); onOpenChange(false) } }}>
      <SheetContent side="bottom" spring="gentle" className="mx-auto flex h-[92vh] max-h-[92vh] max-w-[430px] flex-col rounded-t-3xl border-t border-[#1a263d] bg-[#070a12] p-0 text-white outline-none">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#2a3548]" />
        <header className="flex shrink-0 items-center justify-between px-2 py-1">
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close player" className="rounded-full p-2 text-[#8ba0c7] active:bg-[#172338]">
            <X className="size-5" />
          </button>
          {player.owned && onToggleTradeBlock && (
            <button type="button" onClick={() => onToggleTradeBlock(player)} className={cn("rounded-full px-3 py-1.5 text-xs font-bold", tradeBlockActive ? "bg-[#19ffff]/15 text-[#19ffff]" : "text-[#8ba0c7]")}>
              {tradeBlockActive ? "On block" : "Trade block"}
            </button>
          )}
        </header>

        <section className="shrink-0 px-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-full bg-[#172338]">
              <img src={getPlayerPhoto(player.marketPlayer ?? player)} alt="" className="size-full scale-125 object-cover object-[50%_15%]" onError={(event) => { event.currentTarget.style.display = "none" }} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[22px] font-black leading-tight">{player.name}</h1>
              <p className="mt-0.5 text-[13px] text-[#8ba0c7]">
                <span className={positionColor[player.position]}>{player.position}</span>
                {" · "}{player.team}
                {player.status ? <span className="text-[#ff2a85]"> · {player.status}</span> : null}
              </p>
              {player.schedule && <p className="mt-0.5 text-[13px] text-[#c5d0e0]">{player.schedule.opponent} · {player.schedule.day} {player.schedule.time}</p>}
              {player.ownerName && !player.owned && <p className="mt-0.5 text-xs text-[#8ba0c7]">{player.ownerName}</p>}
            </div>
            <div className="text-right">
              <p className="text-[28px] font-black leading-none tabular-nums text-white">{weekPoints != null ? weekPoints.toFixed(1) : "—"}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#5e7090]">This week</p>
            </div>
          </div>
          {player.tradeBlockNote && !player.owned && <p className="mt-3 text-center text-xs font-bold text-amber-200">On the trade block · {player.tradeBlockNote}</p>}
        </section>

        <nav className="flex shrink-0 border-b border-[#172338]" aria-label="Player sections">
          {tabs.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={cn("relative flex-1 py-3 text-[13px] font-bold", tab === item ? "text-white" : "text-[#5e7090]")}>
              {tabLabel[item]}
              {tab === item && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#19ffff]" />}
            </button>
          ))}
        </nav>

        <SwipeSurface zone="player-tabs" onSwipeLeft={() => shiftTab(1)} onSwipeRight={() => shiftTab(-1)} className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-4 py-4">
            {tab === "summary" && <SummaryTab detail={detail} goalie={goalie} />}
            {tab === "log" && <GameLogTab detail={detail} goalie={goalie} />}
            {tab === "team" && <TeamTab player={player} />}
            {tab === "history" && <HistoryTab detail={detail} goalie={goalie} />}
            {tab === "news" && <NewsTab news={news} />}
          </div>
        </SwipeSurface>

        {action && (
          <div className="shrink-0 border-t border-[#172338] bg-[#070a12] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <button type="button" onClick={action.run} className="h-12 w-full rounded-full bg-[#19ffff] text-sm font-black text-[#080c14] active:scale-[0.98]">
              {action.label}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 text-center">
      <p className="text-base font-black tabular-nums text-white">{value}</p>
      <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-[#5e7090]">{label}</p>
    </div>
  )
}

function SummaryTab({ detail, goalie }: { detail: Detail; goalie: boolean }) {
  const totals = detail.seasonTotals
  const game = detail.gameLog[0]
  const season = goalie
    ? [["GP", totals.gp], ["W", totals.wins], ["SV", totals.saves], ["GA", totals.ga], ["SO", totals.shutouts], ["FPTS", totals.fpts]]
    : [["GP", totals.gp], ["G", totals.g], ["A", totals.a], ["PTS", totals.pts], ["SOG", totals.sog], ["HIT", totals.hits], ["BLK", totals.blk], ["+/-", totals.plusMinus]]
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#5e7090]">Season</p>
        <div className="mt-3 grid grid-cols-4 gap-y-4">
          {season.map(([label, value]) => <Stat key={String(label)} label={String(label)} value={value ?? "—"} />)}
        </div>
        <p className="mt-4 text-center text-[13px] text-[#8ba0c7]">{totals.fpts} FPTS · {totals.fptsPerGame} per game</p>
      </div>
      {game && game.result !== "Did not play" && (
        <div className="flex items-center justify-between border-t border-[#172338] pt-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#5e7090]">Last game</p>
            <p className="mt-1 text-sm font-bold text-white">{game.opp}</p>
            <p className="text-[13px] text-[#8ba0c7]">{game.date} · {goalie ? `${game.decision ?? "—"} · ${game.saves} SV · ${game.ga} GA` : `${game.g} G · ${game.a} A · ${game.sog} SOG`}</p>
          </div>
          <p className="text-2xl font-black tabular-nums text-[#19ffff]">{game.fpts}</p>
        </div>
      )}
      <p className="border-t border-[#172338] pt-4 text-[13px] leading-relaxed text-[#8ba0c7]">
        {detail.bio.age !== "—" ? `Age ${detail.bio.age}` : "Age —"}
        {" · "}{detail.bio.heightWeight}
        {" · "}{detail.bio.experience}
        {detail.bio.draftShort !== "—" ? ` · Draft ${detail.bio.draftShort}` : ""}
      </p>
    </div>
  )
}

function GameLogTab({ detail, goalie }: { detail: Detail; goalie: boolean }) {
  if (detail.gameLog.length === 0) return <p className="text-sm text-[#8ba0c7]">No games logged this season.</p>
  return (
    <ul className="divide-y divide-[#172338]">
      {detail.gameLog.map((game, index) => {
        const missed = game.result === "Did not play"
        const line = missed ? "Did not play" : goalie
          ? `${game.decision ?? "—"} · ${game.saves} SV · ${game.ga} GA · ${game.toi}`
          : `${game.g} G · ${game.a} A · ${game.sog} SOG · ${game.hits} HIT · ${game.blk} BLK`
        return (
          <li key={`${game.date}-${game.opp}-${index}`} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">{game.opp}</p>
              <p className="truncate text-[13px] text-[#8ba0c7]">{game.date} · {line}</p>
            </div>
            <p className={cn("text-lg font-black tabular-nums", missed ? "text-[#5e7090]" : "text-[#19ffff]")}>{missed ? "—" : game.fpts}</p>
          </li>
        )
      })}
    </ul>
  )
}

function TeamTab({ player }: { player: PlayerDialogTarget }) {
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null)
  useEffect(() => {
    fetch(`/api/team-stats?team=${encodeURIComponent(player.team)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: TeamStats) => setTeamStats(data))
      .catch((error) => console.error(`Failed to load team stats for ${player.team}:`, error))
  }, [player.team])
  const rate = (value: number | null) => value == null ? "—" : `${value}%`
  const metrics: Array<[string, string]> = [
    ["Record", teamStats?.record ?? "—"],
    ["Points", teamStats ? String(teamStats.points) : "—"],
    ["GF / game", teamStats ? teamStats.goalsForPerGame.toFixed(2) : "—"],
    ["GA / game", teamStats ? teamStats.goalsAgainstPerGame.toFixed(2) : "—"],
    ["Offense", teamStats ? `#${teamStats.offenseRank}` : "—"],
    ["Defense", teamStats ? `#${teamStats.defenseRank}` : "—"],
    ["Power play", rate(teamStats?.powerPlay ?? null)],
    ["Penalty kill", rate(teamStats?.penaltyKill ?? null)],
  ]
  return (
    <div>
      <p className="text-lg font-black">{player.team}</p>
      <p className="mt-1 text-[13px] text-[#8ba0c7]">{teamStats ? `${(teamStats.pointPct * 100).toFixed(1)} point %` : "Loading team stats"}</p>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        {metrics.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
      </div>
    </div>
  )
}

function HistoryTab({ detail, goalie }: { detail: Detail; goalie: boolean }) {
  if (detail.pastSeasons.length === 0) return <p className="text-sm text-[#8ba0c7]">No earlier NHL seasons are synced.</p>
  return (
    <ul className="divide-y divide-[#172338]">
      {detail.pastSeasons.map((season) => (
        <li key={season.season} className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-bold text-white">{season.season} · {season.team}</p>
            <p className="text-[13px] text-[#8ba0c7]">
              {goalie ? `${season.gp} GP · ${season.wins} W · ${season.saves} SV · ${season.ga} GA` : `${season.gp} GP · ${season.g} G · ${season.a} A · ${season.pts} PTS`}
            </p>
          </div>
          <p className="text-lg font-black tabular-nums text-[#19ffff]">{season.fpts}</p>
        </li>
      ))}
    </ul>
  )
}

function NewsTab({ news }: { news: PlayerNews[] }) {
  if (news.length === 0) return <p className="text-sm text-[#8ba0c7]">No recent news for this player.</p>
  return (
    <ul className="space-y-4">
      {news.map((item) => (
        <li key={item.id} className="border-b border-[#172338] pb-4">
          <p className="text-[13px] font-bold leading-snug text-white">{item.headline}</p>
          <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-[#8ba0c7]">{item.description}</p>
          {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] font-bold text-[#19ffff]">Read</a>}
        </li>
      ))}
    </ul>
  )
}
