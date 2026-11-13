import React, { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { ArrowLeftRight, Award, Check, Plus, Search } from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { type MarketPlayer, type Player, type TradeBlockEntry, type LeagueTradeOffer } from "@/lib/hockey-data"
import { type PlayerDialogTarget } from "@/components/hockey/player-detail-dialog"
import type { PlayerGridSettings } from "@/components/hockey/player-grid-dialog"
import { getPlayerStatsForHorizon, getProjectedFPTS, getSyncedPlayerFPTS, normalizeSearchText } from "@/lib/hockey-calculators"
import { PlayersSubTabView } from "@/components/hockey/players-sub-tab-view"
import { PlayerPortrait } from "@/components/hockey/player-portrait"

type PositionFilter = "ALL" | "C" | "W" | "F" | "D" | "G"
type SkaterSort = "FPTS" | "G" | "A" | "PTS" | "SOG" | "HIT" | "BLK"
type GoalieSort = "FPTS" | "W" | "SV" | "SV%" | "GAA" | "SO"
type MarketSort = SkaterSort | GoalieSort
const skaterSortOptions: SkaterSort[] = ["FPTS", "G", "A", "PTS", "SOG", "HIT", "BLK"]
const goalieSortOptions: GoalieSort[] = ["FPTS", "W", "SV", "SV%", "GAA", "SO"]
function matchesPosition(playerPos: string, filter: PositionFilter): boolean {
  if (filter === "ALL") return true
  if (filter === "C") return playerPos === "C"
  if (filter === "W") return ["W", "LW", "RW"].includes(playerPos)
  if (filter === "F") return ["C", "W", "LW", "RW", "F"].includes(playerPos)
  if (filter === "D") return ["D", "LD", "RD"].includes(playerPos)
  if (filter === "G") return playerPos === "G"
  return false
}
type HorizonMode = "stats" | "projections"
type HockeyHorizon = "Last 7 Days" | "Last 14 Days" | "Last 30 Days" | "Season Totals" | "Season Avg / Per Game" | "This Week" | "Next 14 Days" | "Rest of Season (ROS)"
function marketStat(player: MarketPlayer, stat: "gp" | "goals" | "assists" | "sog" | "hits" | "blocks" | "wins" | "saves" | "goalsAgainst" | "shutouts" | "savePct" | "plusMinus" | "ppp", horizon?: string): number {
  const stats = getPlayerStatsForHorizon(player, horizon)
  if (stat === "gp") return stats.gp
  if (stat === "wins") return "wins" in stats ? stats.wins : 0
  if (stat === "saves") return "saves" in stats ? stats.saves : 0
  if (stat === "goalsAgainst") return "goalsAgainst" in stats ? stats.goalsAgainst : 0
  if (stat === "shutouts") return "shutouts" in stats ? stats.shutouts : 0
  if (stat === "savePct") return "savePct" in stats ? stats.savePct ?? 0 : 0
  if (stat === "goals") return "goals" in stats ? stats.goals ?? 0 : 0
  if (stat === "assists") return "assists" in stats ? stats.assists ?? 0 : 0
  if (stat === "sog") return "sog" in stats ? stats.sog ?? 0 : 0
  if (stat === "hits") return "hits" in stats ? stats.hits ?? 0 : 0
  if (stat === "blocks") return "blocks" in stats ? stats.blocks ?? 0 : 0
  if (stat === "ppp") return "ppp" in stats ? stats.ppp ?? 0 : 0
  return player.currentSeasonStats?.plusMinus ?? 0
}
export const PlayersMarketView = React.memo(function PlayersMarketView({ teamName, roster, players: dynastyPlayers, allLeagueRosterIds, tradeBlock, tradeOffers, onAcceptTrade, onDeclineTrade, onCounterTrade, onInitiateTrade, onSelect, onClaim, onOpenTradeBuilder, activeTradeFilter, setActiveTradeFilter, tradeRequestId = 0 }: { teamName: string; roster: Player[]; players: MarketPlayer[]; allLeagueRosterIds?: Set<number | string>; tradeBlock: TradeBlockEntry[]; tradeOffers: LeagueTradeOffer[]; onAcceptTrade: (tradeId: string) => void; onDeclineTrade: (tradeId: string) => void; onCounterTrade: (trade: LeagueTradeOffer) => void; onInitiateTrade: (player: PlayerDialogTarget) => void; onSelect: (player: PlayerDialogTarget) => void; onClaim: (player: MarketPlayer) => void; onOpenTradeBuilder: () => void; activeTradeFilter: "ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED"; setActiveTradeFilter: (filter: "ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED") => void; tradeRequestId?: number }) {
  const [subTab, setSubTab] = useState<"search" | "available" | "leaders" | "trade">("available")
  useEffect(() => { if (tradeRequestId > 0) setSubTab("trade") }, [tradeRequestId])
  const [filter, setFilter] = useState<PositionFilter>("ALL")
  const [availability, setAvailability] = useState<"ALL" | "FA" | "W">("ALL")
  const [settings, setSettings] = useState<PlayerGridSettings>({ viewType: "Projections", period: "This Week", year: "2026" })
  const [horizonMode, setHorizonMode] = useState<HorizonMode>("projections")
  const [horizon, setHorizon] = useState<HockeyHorizon>("This Week")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [availableSort, setAvailableSort] = useState<MarketSort>("FPTS")
  const [visibleCount, setVisibleCount] = useState(50)
  const isGoalieFilter = filter === "G"
  const currentSortOptions = isGoalieFilter ? goalieSortOptions : skaterSortOptions
  const handlePositionChange = (pos: PositionFilter) => {
    setFilter(pos)
    if (pos === "G" && !goalieSortOptions.includes(availableSort as GoalieSort)) setAvailableSort("FPTS")
    else if (pos !== "G" && !skaterSortOptions.includes(availableSort as SkaterSort)) setAvailableSort("FPTS")
  }
  const players = useMemo(() => [...dynastyPlayers]
    .filter((p) => {
      // Rostered players (any of the 12 teams) are never Free Agents.
      const playerId = p.nhlId ? Number(p.nhlId) : p.name
      if (allLeagueRosterIds?.has(playerId) || allLeagueRosterIds?.has(p.name) || allLeagueRosterIds?.has(normalizeSearchText(p.name))) return false
      const availabilityMatch = availability === "ALL" ? true : availability === "FA" ? p.waiver === "FA" : p.waiver !== "FA"
      return matchesPosition(p.position, filter) && availabilityMatch
    })
    // Decorate-sort-undecorate: compute the sort stat once per player instead of on every comparison.
    .map((player) => {
      const getStat = (player: MarketPlayer, sort: MarketSort) => {
        const statsHorizon = settings.viewType === "Stats" ? horizon : undefined
        const perGame = statsHorizon === "Season Avg / Per Game"
        const gamesPlayed = () => Math.max(1, marketStat(player, "gp", statsHorizon))
        const counting = (stat: "goals" | "assists" | "sog" | "hits" | "blocks" | "wins" | "saves" | "shutouts") => {
          const value = marketStat(player, stat, statsHorizon)
          return perGame ? value / gamesPlayed() : value
        }
        if (sort === "FPTS") return settings.viewType === "Stats" ? getSyncedPlayerFPTS(player, statsHorizon) : (horizon === "This Week" && player.schedule ? player.schedule.weekProjectedFantasyPoints : getProjectedFPTS(player, horizon === "This Week" ? 3.5 : horizon === "Next 14 Days" ? 7 : 28))
        if (sort === "G") return counting("goals")
        if (sort === "A") return counting("assists")
        if (sort === "PTS") return counting("goals") + counting("assists")
        if (sort === "SOG") return counting("sog")
        if (sort === "HIT") return counting("hits")
        if (sort === "BLK") return counting("blocks")
        if (sort === "W") return counting("wins")
        if (sort === "SV") return counting("saves")
        if (sort === "SV%") return marketStat(player, "savePct", statsHorizon)
        if (sort === "SO") return counting("shutouts")
        if (sort === "GAA") {
          const gp = marketStat(player, "gp", statsHorizon)
          return gp > 0 ? -(marketStat(player, "goalsAgainst", statsHorizon) / gp) : -99
        }
        return 0
      }
      return { player, value: getStat(player, availableSort) }
    })
    .sort((a, b) => b.value - a.value)
    .map((entry) => entry.player), [allLeagueRosterIds, availability, availableSort, dynastyPlayers, filter, horizon, settings.viewType])
  const selectPlayer = (p: MarketPlayer) => onSelect({ name: p.name, position: p.position, team: p.team, opponent: p.schedule?.opponent ?? "—", status: p.injuryStatus ?? null, todayPts: p.fpts, projPts: horizonMode === "projections" ? getProjectedFPTS(p, horizon === "This Week" ? 3.5 : horizon === "Next 14 Days" ? 7 : 28) : p.fpts, marketPlayer: p })
  return (
    <div className="flex flex-col">
      <nav aria-label="Player market sections" className="grid grid-cols-4 border-b border-border px-1 text-text-secondary">
        {[{ id: "search" as const, label: "Search", Icon: Search }, { id: "available" as const, label: "Available", Icon: Check }, { id: "leaders" as const, label: "Leaders", Icon: Award }, { id: "trade" as const, label: "Trade", Icon: ArrowLeftRight }].map(({ id, label, Icon }) => <button key={label} type="button" aria-pressed={subTab === id} onClick={() => setSubTab(id)} className={cn("relative flex min-h-12 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md py-1 text-xs font-bold hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring", subTab === id && "text-brand")}>{subTab === id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}<Icon className="size-4" />{label}</button>)}
      </nav>
      {subTab !== "available" ? <PlayersSubTabView teamName={teamName} tab={subTab} roster={roster} players={dynastyPlayers} tradeBlock={tradeBlock} tradeOffers={tradeOffers} onAcceptTrade={onAcceptTrade} onDeclineTrade={onDeclineTrade} onCounterTrade={onCounterTrade} onInitiateTrade={onInitiateTrade} horizonMode={horizonMode} horizon={horizon} onHorizonChange={(mode, next) => { setHorizonMode(mode); setHorizon(next); setSettings({ ...settings, viewType: mode === "stats" ? "Stats" : "Projections", period: next }) }} onSelect={onSelect} onClaim={onClaim} onOpenTradeBuilder={onOpenTradeBuilder} activeTradeFilter={activeTradeFilter} setActiveTradeFilter={setActiveTradeFilter} /> : <>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-base font-bold text-foreground">Available</h2>
        <button type="button" aria-label="Filters" onClick={() => setFiltersOpen(true)} className="flex min-h-11 items-center rounded-full border border-border bg-surface-raised px-3 text-[13px] font-semibold text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring">{filter === "ALL" ? "All" : filter} · {availableSort}</button>
      </div>
      <p className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2 text-xs font-semibold text-text-secondary"><span>Sorted by {availableSort} · {horizon}</span><span>{settings.viewType === "Stats" ? "Actual" : "Projected"} FPTS</span></p>
      <ul data-testid="available-player-list">
        {players.slice(0, visibleCount).map((p) => {
          const points = settings.viewType === "Stats"
            ? getSyncedPlayerFPTS(p, horizon)
            : horizon === "This Week" && p.schedule ? p.schedule.weekProjectedFantasyPoints : getProjectedFPTS(p, horizon === "This Week" ? 3.5 : horizon === "Next 14 Days" ? 7 : 28)
          return (
            <li key={p.nhlId ? `nhl-${p.nhlId}` : p.name} className="flex items-center gap-2 border-b border-border px-3 py-2.5 transition-colors hover:bg-surface-hover">
              <button type="button" onClick={() => selectPlayer(p)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
                <PlayerPortrait player={p} name={p.name} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">{p.name}</span>
                  <span className="block truncate text-xs text-text-secondary">{p.position} · {p.team} · {p.schedule?.opponent ?? "—"}{p.injuryStatus ? ` · ${p.injuryStatus}` : ""}</span>
                </span>
                <span className={cn("shrink-0 text-xs font-semibold", p.waiver === "FA" ? "text-success" : "text-warning")}>{p.waiver === "FA" ? "FA" : "W"}</span>
                <span aria-label={`${settings.viewType === "Stats" ? "Actual" : "Projected"} fantasy points: ${points.toFixed(1)} (${horizon})`} className="w-12 shrink-0 text-right text-sm font-extrabold tabular-nums text-foreground">{points.toFixed(1)}</span>
              </button>
              <button type="button" aria-label={`Add or claim ${p.name}`} onClick={() => onClaim(p)} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-brand text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Plus className="size-4" /></button>
            </li>
          )
        })}
      </ul>
      {players.length === 0 && <p role="status" className="px-4 py-8 text-center text-sm text-text-secondary">No available players match these filters.</p>}
      <p className="px-3 pt-3 text-center text-xs text-text-muted">Showing {Math.min(visibleCount, players.length)} of {players.length} players</p>
      {players.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + 50)} className="mx-auto my-3 block min-h-11 rounded-full border border-brand/50 px-5 py-2 text-sm font-bold text-brand hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring">Show 50 more</button>}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" spring="snappy" className="mx-auto max-h-[80vh] max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-[#1a263d] bg-[#070a12] p-4 text-white">
          <h2 className="text-lg font-black">Filters</h2>
          <p className="mt-4 text-[13px] font-bold text-[#8ba0c7]">Position</p>
          <div className="mt-2 flex flex-wrap gap-2">{(["ALL", "C", "W", "F", "D", "G"] as PositionFilter[]).map((pos) => <button key={pos} type="button" data-testid={`position-filter-${pos}`} onClick={() => handlePositionChange(pos)} className={cn("min-h-11 rounded-full px-3 py-2 text-sm font-semibold", filter === pos ? "bg-brand text-primary-foreground" : "bg-surface-raised text-text-secondary")}>{pos}</button>)}</div>
          <p className="mt-4 text-[13px] font-bold text-[#8ba0c7]">Availability</p>
          <div className="mt-2 flex gap-2">{(["ALL", "FA", "W"] as const).map((value) => <button key={value} type="button" onClick={() => setAvailability(value)} className={cn("min-h-11 rounded-full px-3 py-2 text-sm font-semibold", availability === value ? "bg-brand text-primary-foreground" : "bg-surface-raised text-text-secondary")}>{value === "ALL" ? "All" : value === "FA" ? "Free agents" : "Waivers"}</button>)}</div>
          <p className="mt-4 text-[13px] font-bold text-[#8ba0c7]">Sort</p>
          <div className="mt-2 flex flex-wrap gap-2">{currentSortOptions.map((value) => <button key={value} type="button" onClick={() => setAvailableSort(value)} className={cn("min-h-11 rounded-full px-3 py-2 text-sm font-semibold", availableSort === value ? "bg-brand text-primary-foreground" : "bg-surface-raised text-text-secondary")}>{value}</button>)}</div>
          <p className="mt-4 text-[13px] font-bold text-[#8ba0c7]">Window</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => { setHorizonMode("stats"); setHorizon("Last 14 Days"); setSettings({ ...settings, viewType: "Stats", period: "Last 14 Days" }) }} className={cn("min-h-11 rounded-full px-3 py-2 text-sm font-semibold", horizonMode === "stats" ? "bg-brand text-primary-foreground" : "bg-surface-raised text-text-secondary")}>Stats</button>
            <button type="button" onClick={() => { setHorizonMode("projections"); setHorizon("This Week"); setSettings({ ...settings, viewType: "Projections", period: "This Week" }) }} className={cn("min-h-11 rounded-full px-3 py-2 text-sm font-semibold", horizonMode === "projections" ? "bg-brand text-primary-foreground" : "bg-surface-raised text-text-secondary")}>Projections</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">{(horizonMode === "stats" ? ["Last 7 Days", "Last 14 Days", "Last 30 Days", "Season Totals", "Season Avg / Per Game"] : ["This Week", "Next 14 Days", "Rest of Season (ROS)"]).map((option) => <button key={option} type="button" onClick={() => { const next = option as HockeyHorizon; setHorizon(next); setSettings({ ...settings, period: next }) }} className={cn("min-h-11 rounded-full px-3 py-2 text-sm font-semibold", horizon === option ? "bg-brand text-primary-foreground" : "bg-surface-raised text-text-secondary")}>{option}</button>)}</div>
        </SheetContent>
      </Sheet>
      </>}
    </div>
  )
})
