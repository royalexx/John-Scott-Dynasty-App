import React, { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { ArrowLeftRight, Award, Check, Search, X } from "lucide-react"
import { weekMatchups, getTeamRoster, type MarketPlayer, type Player, type TradeBlockEntry, type LeagueTradeOffer } from "@/lib/hockey-data"
import { PlayerDetailDialog, type PlayerDialogTarget } from "@/components/hockey/player-detail-dialog"
import type { PlayerGridSettings } from "@/components/hockey/player-grid-dialog"
import { PlayerPortrait } from "@/components/hockey/player-portrait"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { getLeaderStat, getPlayerStatsForHorizon, normalizeSearchText, type LeaderCategory, type LeaderMode, type SearchPlayer } from "@/lib/hockey-calculators"
type HorizonMode = "stats" | "projections"
type HockeyHorizon = "Last 7 Days" | "Last 14 Days" | "Last 30 Days" | "Season Totals" | "Season Avg / Per Game" | "This Week" | "Next 14 Days" | "Rest of Season (ROS)"

function rosterOwnerKey(player: { nhlId?: number; name: string }) {
  return player.nhlId != null ? String(player.nhlId) : normalizeSearchText(player.name)
}

function formatShortPlayerName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(" ")}`
}

function tradeAssetLines(assets: LeagueTradeOffer["sendingAssets"]) {
  const lines = [
    ...(assets.players ?? []).filter(Boolean).map((player) => player.name),
    ...(assets.picks ?? []),
  ]
  if (assets.faab) lines.push(`$${assets.faab} FAAB`)
  return lines.length ? lines : ["Nothing"]
}

function HorizonPicker({ mode, horizon, onChange }: { mode: HorizonMode; horizon: HockeyHorizon; onChange: (mode: HorizonMode, horizon: HockeyHorizon) => void }) {
  const options = mode === "stats" ? ["Last 7 Days", "Last 14 Days", "Last 30 Days", "Season Totals", "Season Avg / Per Game"] : ["This Week", "Next 14 Days", "Rest of Season (ROS)"]
  return (
    <>
      <p className="mt-4 text-[13px] font-bold text-[#8ba0c7]">Window</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => onChange("stats", "Last 14 Days")} className={cn("rounded-full px-3 py-1.5 text-sm font-bold", mode === "stats" ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>Stats</button>
        <button type="button" onClick={() => onChange("projections", "This Week")} className={cn("rounded-full px-3 py-1.5 text-sm font-bold", mode === "projections" ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>Projections</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">{options.map((option) => <button key={option} type="button" onClick={() => onChange(mode, option as HockeyHorizon)} className={cn("rounded-full px-3 py-1.5 text-sm font-bold", horizon === option ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{option}</button>)}</div>
    </>
  )
}

function TradeOfferCard({ trade, onAccept, onDecline, onCounter }: { trade: LeagueTradeOffer; onAccept: () => void; onDecline: () => void; onCounter: () => void }) {
  const send = trade.isIncoming ? trade.receivingAssets : trade.sendingAssets
  const receive = trade.isIncoming ? trade.sendingAssets : trade.receivingAssets
  const statusLabel = trade.status === "ACTIVE" ? "Pending" : trade.status === "ACCEPTED" ? "Accepted" : "Declined"
  return (
    <article className="rounded-2xl border border-[#172338] bg-[#101829] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{trade.isIncoming ? trade.senderTeam : trade.receiverTeam}</p>
          <p className="text-[13px] text-[#8ba0c7]">{trade.timestamp}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", trade.status === "ACTIVE" ? "bg-amber-300/15 text-amber-200" : trade.status === "ACCEPTED" ? "bg-emerald-300/15 text-emerald-200" : "bg-rose-300/15 text-rose-200")}>{statusLabel}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[13px] font-bold text-[#8ba0c7]">You send</p>
          <ul className="mt-1 space-y-1">{tradeAssetLines(send).map((line, index) => <li key={`${line}-${index}`} className="text-sm font-bold text-white">{line}</li>)}</ul>
        </div>
        <div>
          <p className="text-[13px] font-bold text-[#8ba0c7]">You receive</p>
          <ul className="mt-1 space-y-1">{tradeAssetLines(receive).map((line, index) => <li key={`${line}-${index}`} className="text-sm font-bold text-white">{line}</li>)}</ul>
        </div>
      </div>
      {trade.status === "ACTIVE" && !trade.isIncoming ? (
        <div className="mt-4">
          <button type="button" onClick={onDecline} className="h-10 w-full rounded-xl bg-rose-500 text-sm font-bold text-white">Cancel Offer</button>
        </div>
      ) : trade.status === "ACTIVE" ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" onClick={onAccept} className="h-10 rounded-xl bg-emerald-400 text-sm font-bold text-[#080c14]">Accept</button>
          <button type="button" onClick={onDecline} className="h-10 rounded-xl bg-rose-500 text-sm font-bold text-white">Decline</button>
          <button type="button" onClick={onCounter} className="h-10 rounded-xl border border-[#19ffff] text-sm font-bold text-[#19ffff]">Counter</button>
        </div>
      ) : null}
    </article>
  )
}
export function PlayersSubTabView({ teamName, tab, roster, players: dynastyPlayers, tradeBlock, tradeOffers, onAcceptTrade, onDeclineTrade, onCounterTrade, onInitiateTrade, horizonMode, horizon, onHorizonChange, onSelect, onClaim, onOpenTradeBuilder, activeTradeFilter, setActiveTradeFilter }: { teamName: string; tab: "search" | "leaders" | "trade"; roster: Player[]; players: MarketPlayer[]; tradeBlock: TradeBlockEntry[]; tradeOffers: LeagueTradeOffer[]; onAcceptTrade: (tradeId: string) => void; onDeclineTrade: (tradeId: string) => void; onCounterTrade: (trade: LeagueTradeOffer) => void; onInitiateTrade: (player: PlayerDialogTarget) => void; horizonMode: HorizonMode; horizon: HockeyHorizon; onHorizonChange: (mode: HorizonMode, horizon: HockeyHorizon) => void; onSelect: (player: PlayerDialogTarget) => void; onClaim: (player: MarketPlayer) => void; onOpenTradeBuilder: () => void; activeTradeFilter: "ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED"; setActiveTradeFilter: (filter: "ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED") => void }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSearchPos, setSelectedSearchPos] = useState("ALL")
  const [searchOwnerFilter, setSearchOwnerFilter] = useState("ALL")
  const [searchTeamFilter, setSearchTeamFilter] = useState("ALL")
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false)
  const [leaderFiltersOpen, setLeaderFiltersOpen] = useState(false)
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
      .map((otherTeamName) => ({ teamName: otherTeamName, players: getTeamRoster(otherTeamName, roster, dynastyPlayers) }))
  }, [roster, dynastyPlayers, teamName])

  const canonicalPlayersByName = useMemo(() => new Map(dynastyPlayers.map((player) => [normalizeSearchText(player.name), player])), [dynastyPlayers])
  const allLeaguePlayers = useMemo<SearchPlayer[]>(() => {
    const rosterOwners = new Map<string, string>()
    roster.forEach((player) => rosterOwners.set(rosterOwnerKey(player), "You"))
    allRosters.forEach((teamRoster) => {
      teamRoster.players.forEach((player) => {
        const key = rosterOwnerKey(player)
        if (!rosterOwners.has(key)) rosterOwners.set(key, teamRoster.teamName)
      })
    })
    return dynastyPlayers.map((player) => {
      const stats = getPlayerStatsForHorizon(player, horizon)
      const owner = rosterOwners.get(rosterOwnerKey(player)) ?? "FA"
      return {
        ...player,
        id: `nhl-${player.nhlId ?? normalizeSearchText(player.name).replace(/\s+/g, "-")}`,
        stats,
        owner,
        projPts: player.projection,
      }
    })
  }, [roster, allRosters, dynastyPlayers, horizon])

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
        const stat = getLeaderStat(player, leaderCategory, leaderMode, projectionGames, horizon)
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
      <button type="button" onClick={() => setSearchFiltersOpen(true)} className="mb-3 max-w-full truncate rounded-full bg-[#172338] px-3 py-1.5 text-left text-[13px] font-bold text-white">{selectedSearchPos} · {searchOwnerFilter === "AVAILABLE" ? "Available" : searchOwnerFilter === "ALL" ? "All owners" : "Rostered"}{searchTeamFilter !== "ALL" ? ` · ${searchTeamFilter}` : ""} · {horizon}</button>
      <Sheet open={searchFiltersOpen} onOpenChange={setSearchFiltersOpen}>
        <SheetContent side="bottom" spring="snappy" className="mx-auto max-h-[80vh] max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-[#1a263d] bg-[#070a12] p-4 text-white">
          <h2 className="text-lg font-black">Filters</h2>
          <p className="mt-4 text-[13px] font-bold text-[#8ba0c7]">Position</p>
          <div className="mt-2 flex flex-wrap gap-2">{["ALL", "C", "LW", "RW", "D", "G"].map((value) => <button key={value} type="button" onClick={() => setSelectedSearchPos(value)} className={cn("rounded-full px-3 py-1.5 text-sm font-bold", selectedSearchPos === value ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{value}</button>)}</div>
          <p className="mt-4 text-[13px] font-bold text-[#8ba0c7]">Ownership</p>
          <div className="mt-2 flex flex-wrap gap-2">{[["ALL", "All"], ["AVAILABLE", "Available"], ["ROSTERED", "Rostered"]].map(([value, label]) => <button key={value} type="button" onClick={() => setSearchOwnerFilter(value)} className={cn("rounded-full px-3 py-1.5 text-sm font-bold", searchOwnerFilter === value ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{label}</button>)}</div>
          <p className="mt-4 text-[13px] font-bold text-[#8ba0c7]">NHL team</p>
          <select aria-label="Filter by NHL team" value={searchTeamFilter} onChange={(event) => setSearchTeamFilter(event.target.value)} className="mt-2 w-full rounded-xl border border-[#263858] bg-[#101829] px-3 py-3 text-sm text-white outline-none"><option value="ALL">All NHL teams</option>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select>
          <HorizonPicker mode={horizonMode} horizon={horizon} onChange={onHorizonChange} />
        </SheetContent>
      </Sheet>
      {searchQuery.length > 0 && filteredSearchResults.length === 0 ? <div className="rounded-lg border border-[#172338] bg-[#0d1424] px-4 py-10 text-center text-sm text-[#8ba0c7]">No players found matching '{searchQuery}'</div> : <div className="rounded-lg border border-[#172338] bg-[#0d1424]">{filteredSearchResults.slice(0, 50).map((player) => {
        const available = player.owner === "FA" || player.owner.startsWith("W")
        const projectionGames = horizonMode === "projections" ? (horizon === "This Week" ? 3.5 : horizon === "Next 14 Days" ? 7 : 28) : undefined
        const points = getLeaderStat(player, "FPTS", leaderMode, projectionGames, horizon).numeric
        return <button type="button" key={player.id} onClick={() => onSelect(toTarget(player))} className="flex w-full items-center gap-2.5 border-b border-[#172338] px-3 py-2.5 text-left transition-colors hover:bg-[#0f1828]/80">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-black", positionClass(player.position))}>{player.position}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{player.name}</span><span className="block truncate text-[13px] text-[#8ba0c7]">{player.team} · {"opponent" in player ? player.opponent : (player.schedule?.opponent ?? "—")}</span></span>
          <span className={cn("shrink-0 text-[13px] font-bold", available ? player.owner.startsWith("W") ? "text-amber-300" : "text-emerald-300" : "text-[#8ba0c7]")}>{player.owner}</span>
          <span className="w-12 text-right text-base font-black tabular-nums text-white">{points.toFixed(1)}</span>
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
      <button type="button" onClick={() => setLeaderFiltersOpen(true)} className="mb-3 max-w-full truncate rounded-full bg-[#172338] px-3 py-1.5 text-left text-[13px] font-bold text-white">{leaderPosFilter} · {leaderCategory} · {horizon}</button>
      <Sheet open={leaderFiltersOpen} onOpenChange={setLeaderFiltersOpen}>
        <SheetContent side="bottom" spring="snappy" className="mx-auto max-h-[80vh] max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-[#1a263d] bg-[#070a12] p-4 text-white">
          <h2 className="text-lg font-black">Filters</h2>
          <p className="mt-4 text-[13px] font-bold text-[#8ba0c7]">Position</p>
          <div className="mt-2 flex flex-wrap gap-2">{(["ALL", "C", "W", "D", "G"] as const).map((position) => <button key={position} type="button" onClick={() => selectLeaderPosition(position)} className={cn("rounded-full px-3 py-1.5 text-sm font-bold", leaderPosFilter === position ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{position}</button>)}</div>
          <p className="mt-4 text-[13px] font-bold text-[#8ba0c7]">Category</p>
          <div className="mt-2 flex flex-wrap gap-2">{leaderCategories.map((category) => <button key={category} type="button" onClick={() => selectLeaderCategory(category)} className={cn("rounded-full px-3 py-1.5 text-sm font-bold", leaderCategory === category ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{category}</button>)}</div>
          <HorizonPicker mode={horizonMode} horizon={horizon} onChange={onHorizonChange} />
        </SheetContent>
      </Sheet>
      <div className="rounded-lg border border-[#172338] bg-[#0d1424]">{sortedLeaders.slice(0, 50).map(({ player, displayValue, rank }) => <button type="button" key={player.id} onClick={() => onSelect(toTarget(player))} className="flex w-full items-center gap-2.5 border-b border-[#172338] px-3 py-2.5 text-left transition-colors hover:bg-[#0f1828]/80"><span className={cn("w-5 text-center text-xs font-black", rank === 1 ? "text-yellow-300" : rank === 2 ? "text-slate-300" : rank === 3 ? "text-amber-600" : "text-[#5e7090]")}>#{rank}</span><span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-black", positionClass(player.position))}>{player.position}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{player.name}</span><span className="block truncate text-[13px] text-[#8ba0c7]">{player.team} · {player.owner}</span></span><span className="text-right text-base font-black tabular-nums text-white">{displayValue}<small className="ml-1 text-xs font-bold text-[#5e7090]">{leaderCategory === "FPTS" && leaderMode === "per_game" ? "FPTS/G" : leaderCategory}</small></span></button>)}</div>
    </div>
  }
  const tradeBlockPlayers = tradeBlock.map((entry) => {
    const player = entry.teamName === teamName ? roster.find((item) => item.id === entry.playerId) : (Array.isArray(allRosters) ? allRosters : []).flatMap((team) => team.players).find((item) => item.id === entry.playerId)
    if (!player) return null
    const databasePlayer = dynastyPlayers.find((candidate) => rosterOwnerKey(candidate) === rosterOwnerKey(player))
    return { player: databasePlayer ? { ...player, ...databasePlayer, id: player.id, slot: player.slot, status: databasePlayer.injuryStatus ?? null, opponent: player.opponent, gameTime: player.gameTime } : player, entry }
  }).filter((item): item is { player: Player; entry: TradeBlockEntry } => item !== null)
  const displayedTrades = tradeOffers.filter((trade) => activeTradeFilter === "ALL" || trade.status === activeTradeFilter)
  return (
    <div className="space-y-4 p-3">
      <section>
        <h2 className="mb-2 text-base font-black text-white">Trade block</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tradeBlockPlayers.map(({ player, entry }) => (
            <button type="button" key={player.id} onClick={() => onSelect({ ...player, owned: entry.teamName === teamName, playerId: player.id, ownerName: entry.teamName, tradeBlockNote: entry.note })} className="min-w-[180px] rounded-2xl border border-[#172338] bg-[#101829] p-3 text-left">
              <div className="flex items-center gap-3">
                <PlayerPortrait player={player} name={player.name} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{formatShortPlayerName(player.name)}</p>
                  <p className="truncate text-[13px] text-[#8ba0c7]">{player.team}</p>
                </div>
              </div>
              <p className="mt-3 truncate text-[13px] text-[#8ba0c7]">{entry.teamName}</p>
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-[#19ffff]/30 bg-[#101a2b] p-4">
        <p className="text-sm font-bold text-[#19ffff]">Propose a trade</p>
        <p className="mt-1 text-[13px] text-[#8ba0c7]">Players, draft picks, and FAAB.</p>
        <button type="button" onClick={onOpenTradeBuilder} className="mt-3 h-10 w-full rounded-xl bg-[#19ffff] text-sm font-bold text-[#080c14]">Open Trade Builder</button>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-black text-white">Offers</h3>
          <div className="flex gap-1">
            {(["ALL", "ACTIVE", "ACCEPTED", "REJECTED"] as const).map((filter) => (
              <button type="button" key={filter} onClick={() => setActiveTradeFilter(filter)} className={cn("rounded-full px-2.5 py-1 text-xs font-bold", activeTradeFilter === filter ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{filter === "ALL" ? "All" : filter === "ACTIVE" ? "Open" : filter === "ACCEPTED" ? "Done" : "Out"}</button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {displayedTrades.length ? displayedTrades.map((trade) => (
            <TradeOfferCard key={trade.id} trade={trade} onAccept={() => onAcceptTrade(trade.id)} onDecline={() => onDeclineTrade(trade.id)} onCounter={() => onCounterTrade(trade)} />
          )) : <p className="rounded-2xl border border-dashed border-[#263858] p-6 text-center text-sm text-[#8ba0c7]">{activeTradeFilter === "ALL" ? "No offers." : `No ${activeTradeFilter.toLowerCase()} offers.`}</p>}
        </div>
      </section>
    </div>
  )
}
