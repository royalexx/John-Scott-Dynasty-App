"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, Heart, Star, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { getPlayerDetail, getPlayerPhoto, type MarketPlayer, type Player, type PlayerProfile, type PlayerStatus, type PlayerGameLog, type PlayerSeasonSummary, type PlayerSchedule, type NhlScheduleGame } from "@/lib/hockey-data"

const slotColors: Record<string, string> = {
  C: "bg-[#1d4ed8] text-white", LW: "bg-[#0d9488] text-white", RW: "bg-[#0d9488] text-white",
  D: "bg-[#b45309] text-white", G: "bg-[#0284c7] text-white",
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

export function PlayerDetailDialog({
  player, open, onOpenChange, onClaim, onSelectPlayer,
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
  const [favorite, setFavorite] = useState(false)
  const [watching, setWatching] = useState(false)
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
  const actionLabel = player.owned ? "DROP" : player.marketPlayer?.waiver === "FA" ? "+ ADD" : player.marketPlayer ? "+ CLAIM" : "TRADE"

  return <Sheet open={open} onOpenChange={(value) => { if (!value) { setTab("summary"); onOpenChange(false) } }}>
    <SheetContent side="bottom" className="mx-auto flex h-[90vh] max-h-[90vh] max-w-[430px] flex-col rounded-t-3xl border-t border-[#1a263d] bg-[#070a12] p-0 text-white outline-none">
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#5e7090]" />
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <button type="button" onClick={() => onOpenChange(false)} aria-label="Close player profile" className="rounded-full p-2 text-[#8ba0c7] transition-colors hover:bg-[#172338]"><ChevronLeft className="size-5" /></button>
        <div className="flex gap-1">{player.owned && onToggleTradeBlock && <button type="button" onClick={() => onToggleTradeBlock(player)} aria-label="Toggle trade block" className={cn("rounded-full border px-2 py-1 text-sm font-black transition-colors", tradeBlockActive ? "border-[#19ffff] bg-[#19ffff]/20 text-[#19ffff]" : "border-transparent text-[#5e7090] hover:bg-[#172338]")}>â‡„</button>}<button type="button" onClick={() => setFavorite(!favorite)} aria-label="Favorite player" className={cn("rounded-full p-2 transition-colors hover:bg-[#172338]", favorite ? "text-amber-300" : "text-[#5e7090]")}><Star className="size-4" fill={favorite ? "currentColor" : "none"} /></button><button type="button" onClick={() => setWatching(!watching)} aria-label="Watchlist" className={cn("rounded-full p-2 transition-colors hover:bg-[#172338]", watching ? "text-[#ff2a85]" : "text-[#5e7090]")}><Heart className="size-4" fill={watching ? "currentColor" : "none"} /></button><button type="button" onClick={() => onOpenChange(false)} aria-label="Close"><X className="size-4 text-[#5e7090]" /></button></div>
      </div>
      <section className="shrink-0 bg-gradient-to-br from-[#0f172a] via-[#101d34] to-[#123246] px-4 pb-3 pt-1">
        <div className="flex items-end gap-3"><div className="relative size-20 shrink-0 overflow-hidden rounded-full border-2 border-[#19ffff]/60 bg-[#172338]"><img src={getPlayerPhoto(player.marketPlayer ?? player)} alt={`${player.name} headshot`} className="size-full scale-[1.35] object-cover object-[50%_18%]" onError={(e) => { e.currentTarget.style.display = "none" }}/></div><div className="min-w-0 flex-1 pb-1"><h1 className="truncate text-xl font-black">{player.name}</h1><p className="text-xs font-bold text-[#8ba0c7]">{player.team} Â· #{player.profile?.sweaterNumber ?? player.marketPlayer?.profile?.sweaterNumber ?? "â€”"} Â· {player.position}</p><div className="mt-1 flex items-center gap-1.5"><span className={cn("rounded px-2 py-0.5 text-[10px] font-black", slotColors[player.position])}>{player.position}</span>{player.status && <span className="rounded bg-[#ff2a85]/20 px-2 py-0.5 text-[10px] font-black text-[#ff2a85]">{player.status}</span>}</div>{player.schedule && <p className="mt-1 text-[10px] font-bold text-[#19ffff]">{player.schedule.day} {player.schedule.time}</p>}</div><div className="text-right"><p className="text-xl font-black tabular-nums text-[#19ffff]">{player.todayPts?.toFixed(1) ?? "â€”"}</p><p className="text-[10px] text-[#8ba0c7]">today Â· wk {player.schedule?.weekFantasyPoints.toFixed(1) ?? "â€”"}</p></div></div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-[10px] text-[#8ba0c7]"><span>AGE<b className="block text-xs text-white">{detail.bio.age}</b></span><span>HT/WT<b className="block text-xs text-white">{detail.bio.heightWeight}</b></span><span>EXP<b className="block text-xs text-white">{detail.bio.experience}</b></span><span>DRAFT<b className="block text-xs text-white">{detail.bio.draftShort}</b></span></div>
        {player.tradeBlockNote && !player.owned && <div className="mt-3 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-center text-[10px] font-black text-amber-200">ON TRADE BLOCK Â· {player.tradeBlockNote}</div>}
        <div className="mt-3 flex gap-2"><button type="button" onClick={() => { if (actionLabel === "TRADE") { onOpenChange(false); onInitiateTrade?.(player) } else if (!player.owned && onClaim) { onOpenChange(false); onClaim(player) } }} className={cn("h-9 flex-1 rounded-full text-xs font-black transition-all hover:brightness-110 active:scale-[0.98]", player.owned ? "bg-[#3b1824] text-[#ff2a85]" : player.marketPlayer?.waiver === "FA" ? "bg-[#19ffff] text-[#080c14]" : player.marketPlayer ? "border border-[#19ffff]/50 bg-[#12283a] text-[#19ffff]" : "bg-[#172338] text-white")}>{actionLabel}</button></div>
      </section>
      <nav className="flex shrink-0 border-b border-[#172338] bg-[#0d1424]">{(["summary", "log", "team", "history", "news"] as Tab[]).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={cn("relative flex-1 py-3 text-[10px] font-black uppercase tracking-wide transition-colors", tab === item ? "text-[#19ffff]" : "text-[#5e7090] hover:text-white")}>{item === "log" ? "Game Log" : item}{tab === item && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-[#19ffff] shadow-[0_0_8px_#19ffff]" />}</button>)}</nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{tab === "summary" && <SummaryTab detail={detail} goalie={player.position === "G"} />}{tab === "log" && <GameLogTab detail={detail} goalie={player.position === "G"} />}{tab === "team" && <TeamTab detail={detail} player={player} />}{tab === "history" && <HistoryTab detail={detail} goalie={player.position === "G"} />}{tab === "news" && <PlayerNewsTab news={news} />}</div>
    </SheetContent>
  </Sheet>
}

function PlayerNewsTab({ news }: { news: PlayerNews[] }) {
  if (news.length === 0) return <Card><p className="text-xs text-[#8ba0c7]">No recent ESPN news found for this player.</p></Card>
  return <div className="space-y-2">{news.map((item) => <Card key={item.id}><p className="text-[9px] font-black uppercase text-[#5e7090]">ESPN NHL News</p><h3 className="mt-1 text-sm font-black text-[#19ffff]">{item.headline}</h3><p className="mt-1 text-xs leading-relaxed text-[#8ba0c7]">{item.description}</p>{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-black text-white underline">Read on ESPN</a>}</Card>)}</div>
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) { return <div className={cn("rounded-xl border border-[#172338] bg-[#101829] p-3", className)}>{children}</div> }
function SummaryTab({ detail, goalie }: { detail: ReturnType<typeof getPlayerDetail>; goalie: boolean }) {
  const game = detail.gameLog[0]
  const totals = detail.seasonTotals
  const statRows = goalie
    ? [["SV", totals.saves], ["GA", totals.ga], ["SO", totals.shutouts], ["W", totals.wins], ["FPTS", totals.fpts]]
    : [["G", totals.g], ["A", totals.a], ["PTS", totals.pts], ["SOG", totals.sog], ["HIT", totals.hits], ["BLK", totals.blk], ["PIM", totals.pim], ["PPP", totals.ppp], ["SHG", totals.shg], ["GWG", totals.gwg], ["+/-", totals.plusMinus], ["FPTS", totals.fpts]]
  return <div className="space-y-3"><div className="grid grid-cols-3 gap-2">{[["GP", totals.gp], ["FPTS", totals.fpts], ["FPTS/GM", totals.fptsPerGame]].map(([label, value]) => <Card key={String(label)}><p className="text-[9px] text-[#5e7090]">{label}</p><b className="mt-1 block text-sm text-[#19ffff]">{value ?? "â€”"}</b><span className="text-[10px] text-[#8ba0c7]">current season</span></Card>)}</div><Card><p className="text-[10px] font-black text-[#8ba0c7]">CURRENT-SEASON TOTALS</p><div className="mt-3 grid grid-cols-4 gap-3 text-xs">{statRows.map(([label, value]) => <div key={String(label)}><span className="text-[9px] text-[#5e7090]">{label}</span><b className="block text-white">{value ?? "â€”"}</b></div>)}</div></Card>{game ? <Card><div className="flex items-center justify-between"><div><p className="text-[10px] font-black text-[#8ba0c7]">LAST LOGGED GAME</p><p className="mt-1 text-xs font-bold">{game.opp} Â· {game.date}</p></div><b className="text-lg text-[#19ffff]">{game.fpts} FPTS</b></div><p className="mt-3 text-xs text-[#8ba0c7]">{goalie ? `${game.decision ?? "â€”"} Â· ${game.saves} SV Â· ${game.ga} GA Â· ${game.shutout ? "SO" : "â€”"} Â· ${game.toi} TOI` : `${game.g} G Â· ${game.a} A Â· ${game.sog} SOG Â· ${game.hits} HIT Â· ${game.blk} BLK Â· ${game.toi} TOI`}</p></Card> : <Card><p className="text-xs text-[#8ba0c7]">No current-season NHL game log is synced for this player.</p></Card>}</div>
}

function GameLogTab({ detail, goalie }: { detail: ReturnType<typeof getPlayerDetail>; goalie: boolean }) { return <div className="space-y-4"><div className="flex gap-2"><span className="rounded-full bg-[#19ffff] px-2.5 py-1 text-[10px] font-black text-[#080c14]">Current season</span></div><Card className="overflow-x-auto p-0"><table className="w-max min-w-[900px] whitespace-nowrap text-center text-[9px]"><thead className="sticky top-0 z-10 bg-[#172338] text-[#5e7090]"><tr>{(goalie ? ["DATE", "OPP", "DEC", "FPTS", "TOI", "GA", "SV", "SA", "SV%", "SO", "PP TOI", "PK TOI"] : ["DATE", "OPP", "RESULT", "FPTS", "TOI", "G", "A", "PTS", "PIM", "SOG", "HIT", "BLK", "GWG", "SHG", "+ / -", "PP TOI", "PK TOI"]).map((head) => <th key={head} className="px-2 py-2 font-black">{head}</th>)}</tr></thead><tbody>{detail.gameLog.map((game, index) => <tr key={`${game.date}-${game.opp}-${index}`} className={cn("border-t border-[#172338]", game.result === "Did not play" && "text-[#5e7090]")}><td className="px-2 py-2">{game.date}</td><td className="px-2">{game.opp}</td><td className="px-2">{goalie ? game.decision : game.result}</td><td className={cn("px-2 font-black", game.result === "Did not play" ? "text-[#5e7090]" : "text-[#19ffff]", game.fpts > 15 && "rounded bg-emerald-400/10")}>{game.fpts}</td><td className="px-2">{game.toi}</td>{goalie ? <><td className="px-2">{game.ga}</td><td className="px-2">{game.saves}</td><td className="px-2">{game.shotsAgainst}</td><td className="px-2">{game.svPct}</td><td className="px-2">{game.shutout ? "1" : "0"}</td><td className="px-2">{game.powerPlayToi}</td><td className="px-2">{game.penaltyKillToi}</td></> : <><td className="px-2">{game.g}</td><td className="px-2">{game.a}</td><td className="px-2">{game.pts}</td><td className="px-2">{game.pim}</td><td className="px-2">{game.sog}</td><td className="px-2">{game.hits}</td><td className="px-2">{game.blk}</td><td className="px-2">{game.gwg}</td><td className="px-2">{game.shg}</td><td className="px-2">{game.plusMinus}</td></>}</tr>)}</tbody></table></Card></div> }

function TeamTab({ detail, player }: { detail: ReturnType<typeof getPlayerDetail>; player: PlayerDialogTarget }) {
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null)
  useEffect(() => {
    fetch(`/api/team-stats?team=${encodeURIComponent(player.team)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: TeamStats) => setTeamStats(data))
      .catch((error) => console.error(`Failed to load team stats for ${player.team}:`, error))
  }, [player.team])
  const metric = (value: number | null, suffix = "") => value == null ? "â€”" : `${value}${suffix}`
  return <div className="space-y-4">
    <Card><p className="text-[10px] font-black uppercase text-[#5e7090]">NHL TEAM CONTEXT</p><p className="mt-2 text-xl font-black text-white">{player.team}</p><p className="mt-1 text-xs text-[#8ba0c7]">{teamStats ? `${teamStats.record} Â· ${teamStats.points} PTS Â· ${(teamStats.pointPct * 100).toFixed(1)} P%` : "Loading current team metricsâ€¦"}</p></Card>
    <Card><p className="mb-3 text-[10px] font-black uppercase text-[#5e7090]">CURRENT TEAM METRICS</p><div className="grid grid-cols-2 gap-3 text-xs">
      {[
        ["GF/GP", teamStats ? teamStats.goalsForPerGame.toFixed(2) : "â€”"],
        ["GA/GP", teamStats ? teamStats.goalsAgainstPerGame.toFixed(2) : "â€”"],
        ["OFFENSE RANK", teamStats ? `#${teamStats.offenseRank}` : "â€”"],
        ["DEFENSE RANK", teamStats ? `#${teamStats.defenseRank}` : "â€”"],
        ["POWER PLAY", metric(teamStats?.powerPlay ?? null, "%")],
        ["PENALTY KILL", metric(teamStats?.penaltyKill ?? null, "%")],
      ].map(([label, value]) => <div key={label}><span className="text-[9px] text-[#5e7090]">{label}</span><b className="block text-white">{value}</b></div>)}
    </div></Card>
    <Card><p className="text-[10px] leading-relaxed text-[#8ba0c7]">GF/GP, GA/GP, standings, and calculated league ranks are sourced from NHL feeds. Power-play and penalty-kill rates come from the NHL Stats REST feed.</p></Card>
  </div>
}

function HistoryTab({ detail, goalie }: { detail: ReturnType<typeof getPlayerDetail>; goalie: boolean }) { const headers = goalie ? ["Season", "Team", "GP", "W", "SV", "GA", "SO", "FPTS", "FPTS/GM"] : ["Season", "Team", "GP", "G", "A", "PTS", "FPTS", "FPTS/GM"]; return <div className="space-y-3"><Card className="overflow-x-auto p-0"><table className="w-full min-w-[520px] text-center text-[10px]"><thead className="bg-[#172338] text-[#5e7090]"><tr>{headers.map((head) => <th key={head} className="px-2 py-2">{head}</th>)}</tr></thead><tbody>{detail.pastSeasons.map((season) => <tr key={season.season} className="border-t border-[#172338]"><td className="px-2 py-2">{season.season}</td><td className="px-2">{season.team}</td><td className="px-2">{season.gp}</td>{goalie ? <><td className="px-2">{season.wins}</td><td className="px-2">{season.saves}</td><td className="px-2">{season.ga}</td><td className="px-2">{season.shutouts}</td></> : <><td className="px-2">{season.g}</td><td className="px-2">{season.a}</td><td className="px-2">{season.pts}</td></>}<td className="px-2 text-[#19ffff]">{season.fpts}</td><td className="px-2">{season.fptsPerGame}</td></tr>)}</tbody></table></Card>{detail.pastSeasons.length === 0 && <Card><p className="text-xs text-[#8ba0c7]">No historical NHL season totals are synced for this player.</p></Card>}</div> }
