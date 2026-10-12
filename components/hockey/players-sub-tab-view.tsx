import React, { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { ArrowLeftRight, Award, Check, Search, X } from "lucide-react"
import { weekMatchups, getTeamRoster, calculatePlayerFPTS, type GoalieStats, type MarketPlayer, type Player, type SkaterStats, type TradeBlockEntry, type LeagueTradeOffer } from "@/lib/hockey-data"
import { PlayerDetailDialog, type PlayerDialogTarget } from "@/components/hockey/player-detail-dialog"
import type { PlayerGridSettings } from "@/components/hockey/player-grid-dialog"
import { PlayerPortrait } from "@/components/hockey/player-portrait"
import { getLeaderStat, getProjectedFPTS, getSyncedPlayerFPTS, getSyncedPlayerStats, normalizeSearchText, type LeaderCategory, type LeaderMode, type SearchPlayer } from "@/lib/hockey-calculators"
type HorizonMode = "stats" | "projections"
type HockeyHorizon = "Last 7 Days" | "Last 14 Days" | "Last 30 Days" | "Season Totals" | "Season Avg / Per Game" | "This Week" | "Next 14 Days" | "Rest of Season (ROS)"

function formatShortPlayerName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(" ")}`
}
export function PlayersSubTabView({ teamName, tab, roster, players: dynastyPlayers, tradeBlock, tradeOffers, onAcceptTrade, onDeclineTrade, onCounterTrade, onInitiateTrade, horizonMode, horizon, onSelect, onClaim, onOpenTradeBuilder, activeTradeFilter, setActiveTradeFilter }: { teamName: string; tab: "search" | "leaders" | "trade"; roster: Player[]; players: MarketPlayer[]; tradeBlock: TradeBlockEntry[]; tradeOffers: LeagueTradeOffer[]; onAcceptTrade: (tradeId: string) => void; onDeclineTrade: (tradeId: string) => void; onCounterTrade: (trade: LeagueTradeOffer) => void; onInitiateTrade: (player: PlayerDialogTarget) => void; horizonMode: HorizonMode; horizon: HockeyHorizon; onSelect: (player: PlayerDialogTarget) => void; onClaim: (player: MarketPlayer) => void; onOpenTradeBuilder: () => void; activeTradeFilter: "ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED"; setActiveTradeFilter: (filter: "ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED") => void }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSearchPos, setSelectedSearchPos] = useState("ALL")
  const [searchOwnerFilter, setSearchOwnerFilter] = useState("ALL")
  const [searchTeamFilter, setSearchTeamFilter] = useState("ALL")
  const [leaderCategory, setLeaderCategory] = useState<LeaderCategory>("FPTS")
  const [leaderPosFilter, setLeaderPosFilter] = useState<"ALL" | "C" | "W" | "D" | "G">("ALL")
  const leaderMode: LeaderMode = horizon === "Season Avg / Per Game" ? "per_game" : "total"
  const goalieCategories: LeaderCategory[] = ["FPTS", "W", "SV", "SV%", "SO"]
  const skaterCategories: LeaderCategory[] = ["FPTS", "G", "A", "SOG", "HIT", "BLK"]
  const leaderCategories = leaderPosFilter === "G" ? goalieCategories : skaterCategories
  const selectLeaderPosition = (position: "ALL" | "C" | "W" | "D" | "G") => {
    setLeaderPosFilter(position)
    if (position === "G" && !goalieCategories.includes(leaderCategory)) setLeaderCategory("FPTS")
    if (position !== "G" && ["W", "SV", "SV%", "SO"].includes(leaderCategory)) setLeaderCategory("FPTS")
  }
  const selectLeaderCategory = (category: LeaderCategory) => {
    setLeaderCategory(category)
    if (["W", "SV", "SV%", "SO"].includes(category) && leaderPosFilter !== "G") setLeaderPosFilter("G")
  }
  const allRosters = useMemo(() => {
    const teamNames = new Set<string>()
    weekMatchups.forEach((matchup) => {
      teamNames.add(matchup.homeTeam)
      teamNames.add(matchup.awayTeam)
    })
    return Array.from(teamNames)
      .filter((otherTeamName) => otherTeamName !== teamName)
      .map((teamName) => ({ teamName, players: getTeamRoster(teamName, roster) }))
  }, [roster])

  const canonicalPlayersByName = useMemo(() => new Map(dynastyPlayers.map((player) => [normalizeSearchText(player.name), player])), [dynastyPlayers])
  const allLeaguePlayers = useMemo<SearchPlayer[]>(() => {
    const rosterOwners = new Map<string, string>()
    roster.forEach((player) => rosterOwners.set(normalizeSearchText(player.name), "You"))
    allRosters.forEach((teamRoster) => {
      teamRoster.players.forEach((player) => {
        const key = normalizeSearchText(player.name)
        if (!rosterOwners.has(key)) rosterOwners.set(key, teamRoster.teamName)
      })
    })
    return dynastyPlayers.map((player) => {
      const stats = getSyncedPlayerStats(player)
      const owner = rosterOwners.get(normalizeSearchText(player.name)) ?? "FA"
      return {
        ...player,
        id: `nhl-${player.nhlId ?? normalizeSearchText(player.name).replace(/\s+/g, "-")}`,
        stats,
        owner,
        projPts: player.projection,
      }
    })
  }, [roster, allRosters, dynastyPlayers])

  const filteredSearchResults = useMemo(() => {
    const query = normalizeSearchText(searchQuery.trim())
    return allLeaguePlayers.filter((player) => {
      const normalizedName = normalizeSearchText(player.name)
      const matchesText = !query ||
        normalizedName.includes(query) ||
        normalizeSearchText(player.team).includes(query) ||
        normalizeSearchText(player.position) === query
      const matchesPos = selectedSearchPos === "ALL" ||
        player.position === selectedSearchPos ||
        (selectedSearchPos === "W" && ["LW", "RW", "W"].includes(player.position)) ||
        (selectedSearchPos === "F" && ["C", "LW", "RW", "W", "F"].includes(player.position))
      const matchesOwner = searchOwnerFilter === "ALL" ||
        (searchOwnerFilter === "AVAILABLE" && (player.owner === "FA" || player.owner.startsWith("W"))) ||
        (searchOwnerFilter === "ROSTERED" && player.owner !== "FA" && !player.owner.startsWith("W"))
      const matchesTeam = searchTeamFilter === "ALL" || player.team === searchTeamFilter
      return matchesText && matchesPos && matchesOwner && matchesTeam
    })
  }, [allLeaguePlayers, searchQuery, selectedSearchPos, searchOwnerFilter, searchTeamFilter])
  const sortedLeaders = useMemo(() => {
    const goalieCategory = ["W", "SV", "SV%", "SO"].includes(leaderCategory)
    const goaliePositionFilter = leaderPosFilter === "G"
    const skaterPositionFilter = ["C", "W", "D"].includes(leaderPosFilter)
    const eligiblePool = allLeaguePlayers.filter((player) => {
      if (goalieCategory || goaliePositionFilter) return player.position === "G"
      if (skaterPositionFilter) return player.position !== "G"
      return true
    })
    const filteredByPos = eligiblePool.filter((player) => {
      if (leaderPosFilter === "ALL") return true
      if (leaderPosFilter === "C") return player.position === "C"
      if (leaderPosFilter === "W") return ["W", "LW", "RW"].includes(player.position)
      if (leaderPosFilter === "D") return ["D", "LD", "RD"].includes(player.position)
      if (leaderPosFilter === "G") return player.position === "G"
      return true
    })
    return filteredByPos
      .map((player) => {
        const projectionGames = horizonMode === "projections" ? horizon === "This Week" ? 3.5 : horizon === "Next 14 Days" ? 7 : 28
          : undefined
        const stat = getLeaderStat(player, leaderCategory, leaderMode, projectionGames)
        return { player, rawValue: stat.numeric, displayValue: stat.display }
      })
      .sort((a, b) => b.rawValue - a.rawValue)
      .map((item, index) => ({ ...item, rank: index + 1 }))
  }, [allLeaguePlayers, leaderCategory, leaderMode, leaderPosFilter, horizon, horizonMode])

  if (tab === "search") {
    const toTarget = (player: SearchPlayer): PlayerDialogTarget => {
      if ("slot" in player) return player
      return {
        name: player.name,
        position: player.position,
        team: player.team,
        opponent: ("schedule" in player ? player.schedule?.opponent : undefined) ?? "—",
        status: null,
        todayPts: player.fpts,
        projPts: player.projection,
        marketPlayer: player,
      }
    }
    const positionClass = (positionValue: string) =>
      positionValue === "G" ? "bg-sky-500 text-white" : positionValue === "D" ? "bg-amber-600 text-white" : positionValue === "C" ? "bg-blue-600 text-white" : "bg-teal-600 text-white"
    const teams = Array.from(new Set(allLeaguePlayers.map((player) => player.team))).sort()
    return <div className="p-3">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-[#5e7090]" />
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search 300+ NHL players" className="w-full rounded-lg border border-[#263858] bg-[#101829] py-2 pl-9 pr-9 text-sm text-white outline-none focus:border-[#19ffff]" />
        {searchQuery.length > 0 && <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")} className="absolute right-2 top-1.5 rounded-full p-1 text-[#8ba0c7] hover:bg-[#172338] hover:text-white"><X className="size-4" /></button>}
      </div>
      <div className="mb-2 flex w-full gap-1.5 overflow-x-auto">{["ALL", "C", "LW", "RW", "D", "G"].map((value) => <button key={value} type="button" onClick={() => setSelectedSearchPos(value)} className={cn("flex-1 rounded-full px-2.5 py-1 text-[10px] font-black", selectedSearchPos === value ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{value}</button>)}{[["ALL", "All"], ["AVAILABLE", "Available Only"]].map(([value, label]) => <button key={value} type="button" onClick={() => setSearchOwnerFilter(value)} className={cn("flex-1 rounded-full px-2.5 py-1 text-[10px] font-black", searchOwnerFilter === value ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{label}</button>)}</div>
      <select aria-label="Filter by NHL team" value={searchTeamFilter} onChange={(event) => setSearchTeamFilter(event.target.value)} className="mb-3 w-full rounded-lg border border-[#263858] bg-[#101829] px-3 py-2 text-xs text-white outline-none"><option value="ALL">All NHL teams</option>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select>
      {searchQuery.length > 0 && filteredSearchResults.length === 0 ? <div className="rounded-lg border border-[#172338] bg-[#0d1424] px-4 py-10 text-center text-sm text-[#8ba0c7]">No players found matching '{searchQuery}'</div> : <div className="rounded-lg border border-[#172338] bg-[#0d1424]">{filteredSearchResults.slice(0, 50).map((player) => {
        const available = player.owner === "FA" || player.owner.startsWith("W")
        const points = horizonMode === "projections"
          ? ("projPts" in player ? player.projPts : player.projection)
          : "stats" in player && player.stats ? calculatePlayerFPTS(player) : Number("fpts" in player ? player.fpts : player.todayPts ?? 0)
        return <button type="button" key={player.id} onClick={() => onSelect(toTarget(player))} className="flex w-full items-center gap-2.5 border-b border-[#172338] px-3 py-2.5 text-left transition-colors hover:bg-[#0f1828]/80">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md text-[10px] font-black", positionClass(player.position))}>{player.position}</span>
          <PlayerPortrait player={player} name={player.name} className="size-8" />
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-white">{player.name}</span><span className="block truncate text-[10px] text-[#5e7090]">{player.team} · {"opponent" in player ? player.opponent : (player.schedule?.opponent ?? "—")}</span></span>
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black", available ? player.owner.startsWith("W") ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/15 text-emerald-300" : "text-[#8ba0c7]")}>{available ? player.owner : player.owner}</span>
          <span className="w-10 text-right text-xs font-black tabular-nums text-[#19ffff]">{points.toFixed(1)}</span>
        </button>
      })}</div>}
    </div>
  }
  if (tab === "leaders") {
    const toTarget = (player: SearchPlayer): PlayerDialogTarget => {
      if ("slot" in player) return player
      return { name: player.name, position: player.position, team: player.team, opponent: ("schedule" in player ? player.schedule?.opponent : undefined) ?? "—", status: null, todayPts: player.fpts, projPts: player.projection, marketPlayer: player }
    }
    const positionClass = (positionValue: string) =>
      positionValue === "G" ? "bg-sky-500 text-white" : positionValue === "D" ? "bg-amber-600 text-white" : positionValue === "C" ? "bg-blue-600 text-white" : "bg-teal-600 text-white"
    return <div className="p-3">
      <div className="mb-2 flex gap-1.5 overflow-x-auto">
        {(["ALL", "C", "W", "D", "G"] as const).map((position) => <button key={position} type="button" onClick={() => selectLeaderPosition(position)} className={cn("h-7 cursor-pointer rounded-full px-3 text-xs font-black transition-all active:scale-95", leaderPosFilter === position ? "bg-[#19ffff] text-[#080c14] shadow-[0_0_8px_rgba(25,255,255,0.3)]" : "border border-[#1b2842] bg-[#101829] text-[#8ba0c7] hover:bg-[#16233b] hover:text-white")}>{position}</button>)}
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto">{leaderCategories.map((category) => <button key={category} type="button" onClick={() => selectLeaderCategory(category)} className={cn("rounded-full px-2.5 py-1 text-[10px] font-black", leaderCategory === category ? "bg-[#19ffff] text-[#080c14]" : "border border-[#1b2842] bg-[#101829] text-[#8ba0c7]")}>{category}</button>)}</div>
      <div className="rounded-lg border border-[#172338] bg-[#0d1424]">{sortedLeaders.slice(0, 50).map(({ player, displayValue, rank }) => <button type="button" key={player.id} onClick={() => onSelect(toTarget(player))} className="flex w-full items-center gap-2.5 border-b border-[#172338] px-3 py-2.5 text-left transition-colors hover:bg-[#0f1828]/80"><span className={cn("w-5 text-center text-xs font-black", rank === 1 ? "text-yellow-300" : rank === 2 ? "text-slate-300" : rank === 3 ? "text-amber-600" : "text-[#5e7090]")}>#{rank}</span><span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-[9px] font-black", positionClass(player.position))}>{player.position}</span><PlayerPortrait player={player} name={player.name} className="size-7" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-white">{player.name}</span><span className="block truncate text-[10px] text-[#5e7090]">{player.team} · {player.owner}</span></span><span className="text-right text-sm font-black tabular-nums text-cyan-400">{displayValue}<small className="ml-1 text-[9px] text-[#5e7090]">{leaderCategory === "FPTS" && leaderMode === "per_game" ? "FPTS/G" : leaderCategory}</small></span></button>)}</div>
    </div>
  }
  const tradeBlockPlayers = tradeBlock.map((entry) => {
    const player = entry.teamName === teamName ? roster.find((item) => item.id === entry.playerId) : (Array.isArray(allRosters) ? allRosters : []).flatMap((team) => team.players).find((item) => item.id === entry.playerId)
    if (!player) return null
    const databasePlayer = dynastyPlayers.find((candidate) => normalizeSearchText(candidate.name) === normalizeSearchText(player.name))
    return { player: databasePlayer ? { ...player, ...databasePlayer, id: player.id, slot: player.slot, status: databasePlayer.injuryStatus ?? null, opponent: player.opponent, gameTime: player.gameTime } : player, entry }
  }).filter((item): item is { player: Player; entry: TradeBlockEntry } => item !== null)
  const displayedTrades = tradeOffers.filter((trade) => activeTradeFilter === "ALL" || trade.status === activeTradeFilter)
  return <div className="space-y-4 p-3"><section><div className="mb-2"><h2 className="text-sm font-black uppercase tracking-wide text-white">Trade Block</h2></div><div className="flex gap-2 overflow-x-auto pb-1">{tradeBlockPlayers.map(({ player, entry }) => <button type="button" key={player.id} onClick={() => onSelect({ ...player,   owned: entry.teamName === teamName, playerId: player.id, ownerName: entry.teamName, tradeBlockNote: entry.note })}   className="min-w-[170px] rounded-xl border border-[#172338] bg-[#101829] p-4 text-left"><div className="flex items-center gap-3"><PlayerPortrait player={player} name={player.name} className="size-10 border border-[#2a3f66]" /><div className="min-w-0 flex-1">  <p className="truncate text-xs font-black text-white">{formatShortPlayerName(player.name)}</p>  <p className="mt-1 truncate text-[10px] text-[#8ba0c7]">{player.team}</p></div></div>  <div className="mt-3 border-t border-[#172338] pt-2">  <span className="text-[10px] font-black text-[#8ba0c7]">{entry.teamName}</span></div></button>)}</div></section><section className="rounded-xl border border-[#19ffff]/30 bg-[#101a2b] p-4"><p className="text-[10px] font-black uppercase text-[#19ffff]">Propose a Trade</p><p className="mt-1 text-xs text-[#8ba0c7]">Build a multi-team offer with players, draft picks, and FAAB.</p><button type="button" onClick={onOpenTradeBuilder} className="mt-3 w-full rounded-full bg-[#19ffff] py-2.5 text-xs font-black text-[#080c14]">Open Trade Builder</button></section><section><div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-black uppercase tracking-wider text-[#5e7090]">Trade History & Active Offers</h3><div className="flex gap-1">{(["ALL", "ACTIVE", "ACCEPTED", "REJECTED"] as const).map((filter) => <button type="button" key={filter} onClick={() => setActiveTradeFilter(filter)} className={cn("rounded-full px-2 py-1 text-[8px] font-black", activeTradeFilter === filter ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{filter}</button>)}</div></div><div className="space-y-2">{displayedTrades.length ? displayedTrades.map((trade) => <div key={trade.id} className="rounded-xl border border-[#172338] bg-[#101829] p-3"><div className="flex items-start gap-2"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1b2842]">🏒</span><div className="min-w-0 flex-1"><p className="text-xs font-black text-white">{trade.senderName} offered {trade.sendingAssets.players?.filter(Boolean).map((player) => player.name).join(", ") || "assets"} for {trade.receivingAssets.players?.filter(Boolean).map((player) => player.name).join(", ") || "assets"}</p><p className="mt-1 text-[10px] text-[#8ba0c7]">You send {trade.isIncoming ? trade.receivingAssets.players?.filter(Boolean).map((player) => player.name).join(", ") : trade.sendingAssets.players?.filter(Boolean).map((player) => player.name).join(", ")} · You receive {trade.isIncoming ? trade.sendingAssets.players?.filter(Boolean).map((player) => player.name).join(", ") : trade.receivingAssets.players?.filter(Boolean).map((player) => player.name).join(", ")}</p><p className="mt-1 text-[9px] text-[#5e7090]">{trade.timestamp}</p></div><span className={cn("rounded px-1.5 py-1 text-[8px] font-black", trade.status === "ACTIVE" ? "bg-amber-300/15 text-amber-200" : trade.status === "ACCEPTED" ? "bg-emerald-300/15 text-emerald-200" : "bg-rose-300/15 text-rose-200")}>{trade.status}</span></div>{trade.status === "ACTIVE" && <div className="mt-3 flex gap-2"><button type="button" onClick={() => onAcceptTrade(trade.id)} className="flex-1 rounded-full bg-emerald-400 py-1.5 text-[9px] font-black text-[#080c14]">ACCEPT</button><button type="button" onClick={() => onDeclineTrade(trade.id)} className="flex-1 rounded-full bg-rose-400 py-1.5 text-[9px] font-black text-white">DECLINE</button><button type="button" onClick={() => onCounterTrade(trade)} className="flex-1 rounded-full border border-[#19ffff] py-1.5 text-[9px] font-black text-[#19ffff]">COUNTER</button></div>}</div>) : <p className="rounded-xl border border-dashed border-[#263858] p-6 text-center text-xs italic text-[#5e7090]">No {activeTradeFilter.toLowerCase()} trade offers.</p>}</div></section></div>
}
