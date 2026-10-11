import React, { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { ArrowLeftRight, Award, Check, Grid2X2, List, Plus, Search, X } from "lucide-react"
import { weekMatchups, getTeamRoster, calculatePlayerFPTS, calculateSkaterFPTS, calculateGoalieFPTS, createPlayerSeasonStats, type GoalieStats, type MarketPlayer, type Player, type PlayerStatus, type SkaterStats, type TradeBlockEntry, type LeagueTradeOffer } from "@/lib/hockey-data"
import { PlayerDetailDialog, type PlayerDialogTarget } from "@/components/hockey/player-detail-dialog"
import type { PlayerGridSettings } from "@/components/hockey/player-grid-dialog"
import { getLeaderStat, getProjectedFPTS, getSyncedPlayerFPTS, getSyncedPlayerStats, normalizeSearchText, type LeaderCategory, type LeaderMode } from "@/lib/hockey-calculators"
import { PlayersSubTabView } from "@/components/hockey/players-sub-tab-view"
import { PlayerPortrait } from "@/components/hockey/player-portrait"

type PositionFilter = "ALL" | "C" | "W" | "F" | "D" | "G"
type HorizonMode = "stats" | "projections"
type HockeyHorizon = "Last 7 Days" | "Last 14 Days" | "Last 30 Days" | "Season Totals" | "Season Avg / Per Game" | "This Week" | "Next 14 Days" | "Rest of Season (ROS)"
function marketStat(player: MarketPlayer, stat: "gp" | "goals" | "assists" | "sog" | "hits" | "blocks" | "wins" | "saves" | "goalsAgainst" | "shutouts" | "savePct" | "plusMinus" | "ppp"): number {
  const stats = getSyncedPlayerStats(player)
  if (stat === "gp") return stats.gp
  if (stat === "wins") return "wins" in stats ? stats.wins : 0
  if (stat === "saves") return "saves" in stats ? stats.saves : 0
  if (stat === "goalsAgainst") return "goalsAgainst" in stats ? stats.goalsAgainst : 0
  if (stat === "shutouts") return "shutouts" in stats ? stats.shutouts : 0
  if (stat === "savePct") return "savePct" in stats ? stats.savePct ?? 0 : 0
  if (stat === "goals") return "goals" in stats ? stats.goals : 0
  if (stat === "assists") return "assists" in stats ? stats.assists : 0
  if (stat === "sog") return "sog" in stats ? stats.sog : 0
  if (stat === "hits") return "hits" in stats ? stats.hits : 0
  if (stat === "blocks") return "blocks" in stats ? stats.blocks : 0
  if (stat === "ppp") return "ppp" in stats ? stats.ppp ?? 0 : 0
  return player.currentSeasonStats?.plusMinus ?? 0
}
function AvailableStats({ player, viewType, horizon }: { player: MarketPlayer; viewType: "Stats" | "Projections"; horizon: HockeyHorizon }) {
  const projection = (horizon === "This Week" && player.schedule
    ? player.schedule.weekProjectedFantasyPoints
    : getProjectedFPTS(player, horizon === "This Week" ? 3.5 : horizon === "Next 14 Days" ? 7 : 28)
  ).toFixed(1)
  const fantasyPoints = viewType === "Stats" ? getSyncedPlayerFPTS(player).toFixed(1) : projection
  if (player.position === "G") {
    const gamesPlayed = marketStat(player, "gp")
    const gaa = gamesPlayed > 0 ? marketStat(player, "goalsAgainst") / gamesPlayed : 0
    return <div className="mt-3 grid grid-cols-4 gap-1 text-[9px] text-[#5e7090] sm:grid-cols-8">
      {[
        ["GP", gamesPlayed],
        ["W", marketStat(player, "wins")],
        ["SV", marketStat(player, "saves")],
        ["SV%", marketStat(player, "savePct").toFixed(3)],
        ["GA", marketStat(player, "goalsAgainst")],
        ["GAA", gaa.toFixed(2)],
        ["SO", marketStat(player, "shutouts")],
        ["FPTS", fantasyPoints],
      ].map(([label, value]) => <span key={label}>{label}<b className={cn("block text-xs", label === "FPTS" ? "text-emerald-300" : "text-white")}>{value}</b></span>)}
    </div>
  }
  return <div className="mt-3 grid grid-cols-5 gap-1 text-[9px] text-[#5e7090] sm:grid-cols-10">
    {[
      ["GP", marketStat(player, "gp")],
      ["G", marketStat(player, "goals")],
      ["A", marketStat(player, "assists")],
      ["PTS", marketStat(player, "goals") + marketStat(player, "assists")],
      ["SOG", marketStat(player, "sog")],
      ["HIT", marketStat(player, "hits")],
      ["BLK", marketStat(player, "blocks")],
      ["PPP", marketStat(player, "ppp")],
      ["+/-", marketStat(player, "plusMinus")],
      ["FPTS", fantasyPoints],
    ].map(([label, value]) => <span key={label}>{label}<b className={cn("block text-xs", label === "FPTS" ? "text-emerald-300" : "text-white")}>{value}</b></span>)}
  </div>
}

function MarketListStats({ player, viewType, horizon }: { player: MarketPlayer; viewType: "Stats" | "Projections"; horizon: HockeyHorizon }) {
  const stats = getSyncedPlayerStats(player)
  const fantasyPoints = viewType === "Stats"
    ? getSyncedPlayerFPTS(player).toFixed(1)
    : (horizon === "This Week" && player.schedule ? player.schedule.weekProjectedFantasyPoints : getProjectedFPTS(player, horizon === "Next 14 Days" ? 7 : 28)).toFixed(1)
  const values = player.position === "G"
    ? [
        (stats as GoalieStats).gp, (stats as GoalieStats).wins, (stats as GoalieStats).saves, ((stats as GoalieStats).savePct ?? 0).toFixed(3),
        (stats as GoalieStats).goalsAgainst, ((stats as GoalieStats).gp > 0 ? (stats as GoalieStats).goalsAgainst / (stats as GoalieStats).gp : 0).toFixed(2), (stats as GoalieStats).shutouts, fantasyPoints,
      ]
    : [
        (stats as SkaterStats).gp, (stats as SkaterStats).goals, (stats as SkaterStats).assists, (stats as SkaterStats).goals + (stats as SkaterStats).assists, (stats as SkaterStats).sog, (stats as SkaterStats).hits,
        (stats as SkaterStats).blocks, (stats as SkaterStats).ppp ?? 0, player.currentSeasonStats?.plusMinus ?? 0, fantasyPoints,
      ]
  return <div className="grid grid-cols-[repeat(8,minmax(44px,1fr))] gap-2 text-center text-[9px] text-[#8ba0c7] sm:grid-cols-[repeat(10,minmax(48px,1fr))]">
    {values.map((value, index) => <span key={index} className={cn(index === values.length - 1 && "font-black text-emerald-300")}>{value}</span>)}
  </div>
}

function MarketListHeader({ position }: { position: "skater" | "goalie" }) {
  const labels = position === "goalie" ? ["GP", "W", "SV", "SV%", "GA", "GAA", "SO", "FPTS"] : ["GP", "G", "A", "PTS", "SOG", "HIT", "BLK", "PPP", "+/-", "FPTS"]
  return <div className="grid grid-cols-[repeat(8,minmax(44px,1fr))] gap-2 text-center text-[8px] font-black text-[#5e7090] sm:grid-cols-[repeat(10,minmax(48px,1fr))]">{labels.map((label) => <span key={label}>{label}</span>)}</div>
}
export function PlayersMarketView({ teamName, roster, players: dynastyPlayers, tradeBlock, tradeOffers, onAcceptTrade, onDeclineTrade, onCounterTrade, onInitiateTrade, onSelect, onClaim, onOpenTradeBuilder, activeTradeFilter, setActiveTradeFilter, tradeMode = false }: { teamName: string; roster: Player[]; players: MarketPlayer[]; tradeBlock: TradeBlockEntry[]; tradeOffers: LeagueTradeOffer[]; onAcceptTrade: (tradeId: string) => void; onDeclineTrade: (tradeId: string) => void; onCounterTrade: (trade: LeagueTradeOffer) => void; onInitiateTrade: (player: PlayerDialogTarget) => void; onSelect: (player: PlayerDialogTarget) => void; onClaim: (player: MarketPlayer) => void; onOpenTradeBuilder: () => void; activeTradeFilter: "ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED"; setActiveTradeFilter: (filter: "ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED") => void; tradeMode?: boolean }) {
  const [subTab, setSubTab] = useState<"search" | "available" | "leaders" | "trade">(tradeMode ? "trade" : "available")
  const [filter, setFilter] = useState<PositionFilter>("ALL")
  const [availability, setAvailability] = useState<"ALL" | "FA" | "W">("ALL")
  const [settings, setSettings] = useState<PlayerGridSettings>({ viewType: "Projections", period: "This Week", year: "2026" })
  const [horizonMode, setHorizonMode] = useState<HorizonMode>("projections")
  const [horizon, setHorizon] = useState<HockeyHorizon>("This Week")
  const [gridView, setGridView] = useState<"grid" | "list">("grid")
  const [availableSort, setAvailableSort] = useState<"FPTS" | "G" | "A" | "SOG" | "HIT" | "BLK">("FPTS")
  const players = [...dynastyPlayers]
    .filter((p) => (filter === "ALL" || (filter === "W" ? ["LW", "RW"].includes(p.position) : p.position === filter)) && (availability === "ALL" || (availability === "FA" ? p.waiver === "FA" : p.waiver !== "FA")))
    .sort((a, b) => {
      const value = (player: MarketPlayer) => {
        return availableSort === "FPTS" ? getSyncedPlayerFPTS(player) : availableSort === "G" ? marketStat(player, "goals") : availableSort === "A" ? marketStat(player, "assists") : availableSort === "SOG" ? marketStat(player, "sog") : availableSort === "HIT" ? marketStat(player, "hits") : marketStat(player, "blocks")
      }
      return value(b) - value(a)
    })
  const selectPlayer = (p: MarketPlayer) => onSelect({ name: p.name, position: p.position, team: p.team, opponent: "vs BOS", status: p.injuryStatus ?? null, todayPts: p.fpts, projPts: horizonMode === "projections" ? getProjectedFPTS(p, horizon === "This Week" ? 3.5 : horizon === "Next 14 Days" ? 7 : 28) : p.fpts, marketPlayer: p })
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-4 border-b border-[#141e33] px-1 py-2 text-[#5e7090]">
        {[{ id: "search" as const, label: "Search", Icon: Search }, { id: "available" as const, label: "Available", Icon: Check }, { id: "leaders" as const, label: "Leaders", Icon: Award }, { id: "trade" as const, label: "Trade", Icon: ArrowLeftRight }].map(({ id, label, Icon }) => <button key={label} type="button" onClick={() => setSubTab(id)} className={cn("relative flex w-full cursor-pointer flex-col items-center gap-1 py-1 text-[9px] font-bold", subTab === id && "text-[#19ffff] [text-shadow:0_0_8px_rgba(25,255,255,0.5)]")}>{subTab === id && <span className="absolute inset-x-3 -bottom-2 h-0.5 rounded-full bg-[#19ffff]" />}<Icon className="size-4" />{label}</button>)}
      </div>
      {subTab !== "trade" && <div className="border-b border-[#111929] bg-[#0b1220] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <button type="button" onClick={() => { setHorizonMode("stats"); setHorizon("Last 14 Days"); setSettings({ ...settings, viewType: "Stats", period: "Last 14 Days" }) }} className={cn("rounded-full px-2.5 py-1 text-[10px] font-black", horizonMode === "stats" ? "bg-[#19ffff] text-[#080c14]" : "border border-[#1b2842] bg-[#101829] text-[#8ba0c7]")}>STATS</button>
            <button type="button" onClick={() => { setHorizonMode("projections"); setHorizon("Next 14 Days"); setSettings({ ...settings, viewType: "Projections", period: "Next 14 Days" }) }} className={cn("rounded-full px-2.5 py-1 text-[10px] font-black", horizonMode === "projections" ? "bg-[#19ffff] text-[#080c14]" : "border border-[#1b2842] bg-[#101829] text-[#8ba0c7]")}>PROJECTIONS</button>
          </div>
          <select aria-label="Hockey time horizon" value={horizon} onChange={(event) => { const next = event.target.value as HockeyHorizon; setHorizon(next); setSettings({ ...settings, period: next }) }} className="max-w-[155px] rounded-full border border-[#1b2842] bg-[#101829] px-2.5 py-1 text-[10px] font-black text-[#8ba0c7] outline-none">
            {(horizonMode === "stats" ? ["Last 7 Days", "Last 14 Days", "Last 30 Days", "Season Totals", "Season Avg / Per Game"] : ["This Week", "Next 14 Days", "Rest of Season (ROS)"]).map((option) => <option key={option}>{option}</option>)}
          </select>
        </div>
      </div>}
      {subTab !== "available" ? <PlayersSubTabView teamName={teamName} tab={subTab} roster={roster} players={dynastyPlayers} tradeBlock={tradeBlock} tradeOffers={tradeOffers} onAcceptTrade={onAcceptTrade} onDeclineTrade={onDeclineTrade} onCounterTrade={onCounterTrade} onInitiateTrade={onInitiateTrade} horizonMode={horizonMode} horizon={horizon} onSelect={onSelect} onClaim={onClaim} onOpenTradeBuilder={onOpenTradeBuilder} activeTradeFilter={activeTradeFilter} setActiveTradeFilter={setActiveTradeFilter} /> : <>
      <div className="border-b border-[#111929] px-3 py-2">
        <div className="flex items-center gap-2"><h2 className="text-sm font-black text-white">{tradeMode ? "Trade Center" : "Available"}</h2><button type="button" onClick={() => setGridView(gridView === "grid" ? "list" : "grid")} className="cursor-pointer text-[#5e7090] transition-all duration-150 hover:text-white active:scale-95">{gridView === "grid" ? <List className="size-4" /> : <Grid2X2 className="size-4" />}</button><div className="flex gap-1.5">{(["ALL", "FA", "W"] as const).map((value) => <button key={value} type="button" onClick={() => setAvailability(value)} className={cn("rounded-full border px-2 py-0.5 text-[9px] font-black transition-all duration-150 active:scale-95", availability === value ? "border-[#19ffff] bg-[#19ffff] text-[#080c14]" : "border-[#17233c] bg-[#101829] text-[#5e7090] cursor-pointer hover:bg-[#16233b] hover:border-[#2a3f66] hover:text-white")}>{value}</button>)}</div></div>
        <div className="mt-2 flex gap-1 overflow-x-auto"><span className="py-1 text-[9px] font-black text-[#5e7090]">SORT</span>{(["FPTS", "G", "A", "SOG", "HIT", "BLK"] as const).map((value) => <button key={value} type="button" onClick={() => setAvailableSort(value)} className={cn("rounded-full px-2 py-1 text-[9px] font-black", availableSort === value ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{value}</button>)}</div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-b border-[#111929] px-3 py-1.5">{(["ALL", "C", "W", "F", "D", "G"] as PositionFilter[]).map((pos) => <button key={pos} type="button" onClick={() => setFilter(pos)} className={cn("rounded-full border px-2.5 py-0.5 text-[9px] font-black transition-all duration-150 active:scale-95", filter === pos ? "border-[#19ffff] bg-[#19ffff] text-black hover:brightness-110" : "cursor-pointer border-[#17233c] bg-[#101829] text-[#5e7090] hover:bg-[#16233b] hover:border-[#2a3f66] hover:text-white")}>{pos}</button>)}</div>
      {gridView === "list" ? (
        <div className="overflow-x-auto border-y border-[#111929]">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-3 border-b border-[#111929] bg-[#0b1220] px-3 py-2">
              <span className="sticky left-0 z-10 bg-[#0b1220] text-[9px] font-black text-[#5e7090]">PLAYER</span>
              <MarketListHeader position={players.some((player) => player.position === "G") ? "goalie" : "skater"} />
            </div>
            {players.slice(0, 50).map((p) => {
              const position = p.position === "G" ? "goalie" : "skater"
              return <div key={p.name} onClick={() => selectPlayer(p)} className="grid cursor-pointer grid-cols-[220px_minmax(0,1fr)] gap-3 border-b border-[#111929] bg-[#0d1424] px-3 py-2.5 text-left transition-colors hover:bg-[#0f1828]/80">
                <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2 bg-[#0d1424]">
                  <PlayerPortrait player={p} name={p.name} className="size-8 shrink-0" />
                  <div className="min-w-0"><p className="truncate text-xs font-black text-white">{p.name}</p><p className="truncate text-[10px] text-[#5e7090]">{p.position} · {p.team}{p.injuryStatus && <span className="ml-1 font-black text-rose-300">{p.injuryStatus}</span>}</p></div>
                  <button type="button" aria-label={`Claim ${p.name}`} onClick={(event) => { event.stopPropagation(); onClaim(p) }} className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full border border-[#19ffff]/50 text-[#19ffff] hover:bg-[#19ffff] hover:text-[#080c14]"><Plus className="size-3.5" /></button>
                </div>
                <MarketListStats player={p} viewType={settings.viewType === "Stats" ? "Stats" : "Projections"} horizon={horizon} />
              </div>
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-px border-y border-[#111929] bg-[#111929]">
          {players.slice(0, 50).map((p) => <div key={p.name} onClick={() => selectPlayer(p)} className="cursor-pointer border-b border-[#111929] bg-[#0d1424] p-3 transition-colors duration-150 hover:bg-[#0f1828]/80">
            <div className="flex items-start gap-2"><PlayerPortrait player={p} name={p.name} className="size-8" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-white">{p.name}</p><p className="text-[10px] text-[#5e7090]">{p.position} · {p.team} · vs BOS {p.injuryStatus && <span className="ml-1 font-black text-rose-300">{p.injuryStatus}</span>}</p><button type="button" onClick={(event) => { event.stopPropagation(); onClaim(p) }} className={cn("mt-1 cursor-pointer rounded px-1 py-0.5 text-[9px] font-black transition-all duration-150 active:scale-95", p.waiver === "FA" ? "bg-emerald-400/15 text-emerald-300 hover:brightness-110" : "bg-amber-400/15 text-amber-300 hover:brightness-110")}>{p.waiver}</button></div><button type="button" aria-label={`Add or claim ${p.name}`} onClick={(event) => { event.stopPropagation(); onClaim(p) }} className="flex size-6 cursor-pointer items-center justify-center rounded-full border border-[#19ffff]/50 text-[#19ffff] transition-all duration-150 hover:scale-110 hover:bg-[#19ffff] hover:text-[#080c14] hover:border-[#19ffff] hover:shadow-[0_0_10px_rgba(25,255,255,0.4)] active:scale-90"><Plus className="size-3.5" /></button></div>
            {settings.viewType === "Projections" && <AvailableStats player={p} viewType="Projections" horizon={horizon} />}
            {settings.viewType === "Stats" && <AvailableStats player={p} viewType="Stats" horizon={horizon} />}
            {settings.viewType === "ADP" && <div className="mt-3 flex justify-between text-[10px] font-black text-[#8ba0c7]"><span>ADP {p.adp}</span><span>{p.rostered} ROST</span></div>}
          </div>)}
        </div>
      )}
      </>}
    </div>
  )
}

function MarketPlayerRow({ player, onSelect, onClaim, meta }: { player: MarketPlayer; onSelect: (player: PlayerDialogTarget) => void; onClaim?: (player: MarketPlayer) => void; meta?: React.ReactNode }) {
  const target = { name: player.name, position: player.position, team: player.team, opponent: "vs BOS", status: null as PlayerStatus, todayPts: player.fpts, projPts: player.projection, marketPlayer: player }
  return <button type="button" onClick={() => onSelect(target)} className="flex w-full items-center gap-2 border-b border-[#172338] px-3 py-2.5 text-left transition-colors hover:bg-[#0f1828]/80"><PlayerPortrait player={player} name={player.name} className="size-8" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-white">{player.name}</span><span className="block text-[10px] text-[#5e7090]"><b className={cn("mr-1 rounded px-1", player.position === "G" ? "bg-sky-400/20 text-sky-300" : player.position === "D" ? "bg-amber-400/20 text-amber-300" : player.position === "C" ? "bg-blue-400/20 text-blue-300" : "bg-teal-400/20 text-teal-300")}>{player.position}</b>{player.team} · {player.waiver === "FA" ? "FA" : player.waiver}{player.injuryStatus && <b className="ml-1 text-rose-300">{player.injuryStatus}</b>}</span></span>{meta}<span className="text-xs font-black tabular-nums text-[#19ffff]">{player.projection.toFixed(1)}</span>{onClaim && <span role="button" tabIndex={0} aria-label={`Claim ${player.name}`} onClick={(event) => { event.stopPropagation(); onClaim(player) }} className="flex size-6 items-center justify-center rounded-full border border-[#19ffff]/50 text-[#19ffff] hover:bg-[#19ffff] hover:text-[#080c14]">+</span>}</button>
}

type SearchPlayer = (Player | MarketPlayer) & { id: string; owner: string }
