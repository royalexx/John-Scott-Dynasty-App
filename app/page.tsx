"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  Search, 
  ArrowLeftRight, 
  Award, 
  MessageSquare, 
  Check, 
  Flame, 
  Zap,
  Calendar,
  Receipt,
  Newspaper,
  X,
  ChevronDown as   Grid2X2,
  List,
  Plus,
} from "lucide-react"

import { 
  roster as initialRoster, 
  standings, 
  draftPicks, 
  activities,
  weekMatchups,
  teamSchedule,
  getTeamRoster,
  calculatePlayerFPTS,
  calculateSkaterFPTS,
  calculateGoalieFPTS,
  createPlayerSeasonStats,
  type SkaterStats,
  type GoalieStats,
  type Player,
  type MarketPlayer,
  type PlayerStatus,
  type WaiverClaim,
  defaultFaabBudget,
  league,
  type TradeBlockEntry,
  type LeagueTradeOffer,
  type MatchupSummary,
  type LiveMatchupSummary,
  getPlayerSchedule,
  TAXI_MAX_NHL_GAMES,
  type NhlScheduleGame,
} from "@/lib/hockey-data"
import { MatchupPanel } from "@/components/hockey/matchup-panel"
import { PlayerDetailDialog, type PlayerDialogTarget } from "@/components/hockey/player-detail-dialog"
import { LineupSlotDialog } from "@/components/hockey/lineup-slot-dialog"
import { DirectMessagesDialog } from "@/components/hockey/direct-messages-dialog"
import { LeagueChatDrawer } from "@/components/hockey/league-chat-drawer"
import type { PlayerGridSettings } from "@/components/hockey/player-grid-dialog"
import { WaiverClaimDialog } from "@/components/hockey/waiver-claim-dialog"
import { TransactionsDrawer } from "@/components/hockey/transactions-drawer"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { TradeBuilderDialog, type TradeProposal, type TradeTeam } from "@/components/hockey/trade-builder-dialog"
import { LeagueFeed } from "@/components/hockey/league-feed"
import { PlayerItem, slotBadgeColors } from "@/components/hockey/player-item"
import { PlayerPortrait } from "@/components/hockey/player-portrait"
import { TeamHeader } from "@/components/hockey/team-header"
import { TeamDrawer } from "@/components/hockey/team-drawer"
import { PlayersMarketView } from "@/components/hockey/players-market-view"
import { LeagueStandingsView } from "@/components/hockey/league-standings-view"
import { normalizeSearchText } from "@/lib/hockey-calculators"

type MainTab = "MATCH" | "TEAM" | "PLAYERS" | "LEAGUE"

function preloadPortraits(urls: string[]) {
  const load = () => {
    urls.forEach((url) => {
      const image = new window.Image()
      image.decoding = "async"
      image.src = url
    })
  }
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(load, { timeout: 1500 })
  } else {
    setTimeout(load, 250)
  }
}

const startingSlots: Array<{ slot: "C" | "W" | "F" | "D" | "G"; capacity: number }> = [
  { slot: "C", capacity: 3 },
  { slot: "W", capacity: 6 },
  { slot: "F", capacity: 3 },
  { slot: "D", capacity: 6 },
  { slot: "G", capacity: 2 },
]

export default function SleeperDynastyApp() {
  const [activeTab, setActiveTab] = useState<MainTab>("TEAM")
  const [allDynastyPlayers, setAllDynastyPlayers] = useState<MarketPlayer[]>([])
  const [scheduleGames, setScheduleGames] = useState<NhlScheduleGame[]>([])
  const [playerGameLogs, setPlayerGameLogs] = useState<Record<string, Array<Record<string, string | number | null>>>>({})

  function selectCanonicalPlayer(source: Partial<PlayerDialogTarget> & Pick<PlayerDialogTarget, "name">) {
    const databasePlayer = allDynastyPlayers.find((candidate) => normalizeSearchText(candidate.name) === normalizeSearchText(source.name))
    const rosterPlayer = roster.find((candidate) => normalizeSearchText(candidate.name) === normalizeSearchText(source.name))
    const owner = rosterPlayer ? teamName : source.ownerName
    setSelectedPlayer({
      name: source.name,
      position: rosterPlayer?.position ?? databasePlayer?.position ?? source.position ?? "C",
      team: databasePlayer?.team ?? rosterPlayer?.team ?? source.team ?? "NHL",
      opponent: rosterPlayer?.opponent ?? source.opponent ?? "—",
      status: databasePlayer?.injuryStatus ?? null,
      todayPts: rosterPlayer?.todayPts ?? source.todayPts ?? null,
      projPts: rosterPlayer?.projPts ?? databasePlayer?.projection ?? source.projPts ?? 0,
      marketPlayer: databasePlayer ?? source.marketPlayer,
      profile: databasePlayer?.profile ?? source.profile,
      currentSeasonStats: databasePlayer?.currentSeasonStats ?? source.currentSeasonStats,
      gameLog: databasePlayer?.gameLog ?? source.gameLog,
      historicalSeasons: databasePlayer?.historicalSeasons ?? source.historicalSeasons,
      schedule: databasePlayer?.schedule ?? source.schedule,
      owned: Boolean(rosterPlayer),
      playerId: rosterPlayer?.id ?? (databasePlayer?.nhlId ? `nhl-${databasePlayer.nhlId}` : source.playerId),
      ownerName: owner,
      tradeBlockNote: rosterPlayer ? tradeBlock.find((entry) => entry.playerId === rosterPlayer.id)?.note : source.tradeBlockNote,
    })
  }

  useEffect(() => {
    fetch(`/api/players?source=complete-database-v2&v=${Date.now()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const scheduledPlayers = data.map((player: MarketPlayer) => {
            const liveLogs = player.nhlId ? playerGameLogs[String(player.nhlId)] ?? [] : []
            const mergedGameLog = [...(player.gameLog ?? []), ...liveLogs]
              .filter((game, index, games) => games.findIndex((candidate) => candidate.gameId === game.gameId) === index) as MarketPlayer["gameLog"]
            return {
              ...player,
              gameLog: mergedGameLog,
              schedule: getPlayerSchedule(player.team, scheduleGames, mergedGameLog, player.position, player.currentSeasonStats, player.projection),
            }
          })
          setAllDynastyPlayers(scheduledPlayers)
          const portraitsByName = new Map(scheduledPlayers.map((player: MarketPlayer) => [normalizeSearchText(player.name), player]))
          setRoster((current) => current.map((player) => {
            const databasePlayer = portraitsByName.get(normalizeSearchText(player.name))
            const playerSchedule = databasePlayer?.schedule ?? (databasePlayer ? getPlayerSchedule(databasePlayer.team, scheduleGames, databasePlayer.gameLog, databasePlayer.position, databasePlayer.currentSeasonStats, databasePlayer.projection) : undefined)
            return databasePlayer ? {
              ...player,
              team: databasePlayer.team,
              opponent: playerSchedule?.opponent ?? player.opponent,
              nhlId: databasePlayer.nhlId,
              headshot: databasePlayer.headshot,
              profile: databasePlayer.profile,
              currentSeasonStats: databasePlayer.currentSeasonStats,
              gameLog: databasePlayer.gameLog,
              historicalSeasons: databasePlayer.historicalSeasons,
              nhlGamesPlayed: databasePlayer.nhlGamesPlayed,
              gamesPlayed: databasePlayer.nhlGamesPlayed,
              schedule: playerSchedule,
              status: databasePlayer.injuryStatus ?? null,
              projPts: databasePlayer.projection,
              todayPts: playerSchedule?.todayFantasyPoints ?? null,
            } : player
          }))
          const rosterPortraits = initialRoster
            .map((player) => portraitsByName.get(normalizeSearchText(player.name))?.headshot)
            .filter((headshot): headshot is string => Boolean(headshot))
          preloadPortraits([...new Set([...rosterPortraits, ...scheduledPlayers.slice(0, 50).map((player: MarketPlayer) => player.headshot).filter((headshot): headshot is string => Boolean(headshot))])])
        }
      })
      .catch((err) => console.error("Error loading dynasty players:", err))
  }, [scheduleGames, playerGameLogs])
  useEffect(() => {
    fetch("/api/schedule", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { weekGames?: NhlScheduleGame[]; playerGameLogs?: Record<string, Array<Record<string, string | number | null>>> }) => {
        setScheduleGames(data.weekGames ?? [])
        setPlayerGameLogs(data.playerGameLogs ?? {})
      })
      .catch((error) => console.error("Error loading NHL schedule:", error))
  }, [])
  const [week, setWeek] = useState(1)
  const [selectedMatchupId, setSelectedMatchupId] = useState(weekMatchups[0].id)
  const [liveMatchups, setLiveMatchups] = useState<Record<string, LiveMatchupSummary>>({})
  const handleLiveSummary = useCallback((summary: LiveMatchupSummary) => {
    setLiveMatchups((current) => ({ ...current, [summary.id]: summary }))
  }, [])
  const [roster, setRoster] = useState<Player[]>(initialRoster)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDialogTarget | null>(null)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [editingSlot, setEditingSlot] = useState<Player["slot"] | null>(null)
  const [dmOpen, setDmOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatPreview, setChatPreview] = useState("Priya: Anyone streaming a G tonight? Shesterkin is banged up")
  const [teamDrawer, setTeamDrawer] = useState<"schedule" | "settings" | "transactions" | "news" | null>(null)
  const [playerNicknames, setPlayerNicknames] = useState<Record<string, string>>({})
  const [tradeMode, setTradeMode] = useState(false)
  const [teamName, setTeamName] = useState("Montreal Monarchs")
  const [teamLogo, setTeamLogo] = useState("")
  const [pendingClaims, setPendingClaims] = useState<WaiverClaim[]>([])
  const [userFaab, setUserFaab] = useState(defaultFaabBudget)
  const [claimPlayer, setClaimPlayer] = useState<MarketPlayer | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [tradeBlock, setTradeBlock] = useState<TradeBlockEntry[]>(league.tradeBlock)
  const [tradeBuilderOpen, setTradeBuilderOpen] = useState(false)
  const [activeTradeFilter, setActiveTradeFilter] = useState<"ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED">("ALL")
  const [tradeOffers, setTradeOffers] = useState<LeagueTradeOffer[]>(() => {
    const marner = getTeamRoster("Toronto Titans", initialRoster).find((player) => player.name === "Mitch Marner")
    return marner ? [{
      id: "offer-toronto-makar-marner",
      senderName: "Jordan",
      senderTeam: "Toronto Titans",
      receiverName: "AlexRoy",
      receiverTeam: "Montreal Monarchs",
      sendingAssets: { players: [marner] },
      receivingAssets: { players: [initialRoster.find((player) => player.name === "Cale Makar")!], picks: [] },
      status: "ACTIVE",
      timestamp: "Today, 8:14 PM",
      isIncoming: true,
    }] : []
  })
  const [counterTrade, setCounterTrade] = useState<{ offer: LeagueTradeOffer; partnerId: string; offering: string[]; receiving: string[] } | null>(null)
  const [prefilledTrade, setPrefilledTrade] = useState<{ partnerId: string; offering: string[]; receiving: string[] } | null>(null)

  function handleRosterMove(playerId: string, destSlot: Player["slot"], targetPlayerId?: string) {
    const source = roster.find((player) => player.id === playerId)
    const target = targetPlayerId ? roster.find((player) => player.id === targetPlayerId) : undefined
    if (!source) return
    setRoster((current) => current.map((player) => {
      if (target && player.id === target.id) return { ...player, slot: source.slot }
      if (player.id === source.id) return { ...player, slot: target ? target.slot : destSlot }
      return player
    }))
    const message = target
      ? `Swapped ${source.name} with ${target.name}`
      : `${source.name} moved to Starting ${destSlot}`
    setToast(message)
    window.setTimeout(() => setToast(null), 3000)
  }

  function submitClaim(claim: WaiverClaim) {
    setPendingClaims((current) => [...current, claim])
    setUserFaab((current) => current - claim.bidAmount)
    setToast(`${claim.playerToAdd.name} has been added to your waivers`)
    window.setTimeout(() => setToast(null), 3000)
  }

  function cancelClaim(claim: WaiverClaim) {
    setPendingClaims((current) => current.filter((item) => item.id !== claim.id))
    setUserFaab((current) => current + claim.bidAmount)
  }

  function toggleTradeBlock(player: PlayerDialogTarget) {
    if (!player.playerId) return
    const existing = tradeBlock.find((entry) => entry.playerId === player.playerId)
    if (existing) {
      setTradeBlock((current) => current.filter((entry) => entry.playerId !== player.playerId))
      setToast(`${player.name} removed from your trade block`)
    } else {
      setTradeBlock((current) => [...current, { playerId: player.playerId!, teamName: teamName, note: "Looking for: Top 4 D or 2027 1st" }])
      setToast(`${player.name} added to your trade block`)
    }

    window.setTimeout(() => setToast(null), 3000)
  }

  function handleInitiateTradeWithPlayer(player: PlayerDialogTarget) {
    const partner = tradePartners.find((candidate) =>
      candidate.players.some((candidatePlayer) => candidatePlayer.id === player.playerId) ||
      candidate.name === player.ownerName ||
      candidate.players.some((candidatePlayer) => candidatePlayer.team === player.team),
    )
    if (!partner || !player.playerId) return
    setSelectedPlayer(null)
    setCounterTrade(null)
    setPrefilledTrade({ partnerId: partner.id, offering: [], receiving: [player.playerId] })
    setTradeBuilderOpen(true)
  }

  function handleLeagueTrade(team: (typeof standings)[number]) {
    const partner = tradePartners.find((candidate) => candidate.name === team.team)
    if (!partner) {
      setToast(`${team.team} is not available for trading right now`)
      window.setTimeout(() => setToast(null), 3000)
      return
    }
    setCounterTrade(null)
    setPrefilledTrade({ partnerId: partner.id, offering: [], receiving: [] })
    setTradeBuilderOpen(true)
  }

  function handleLeaguePlayer(player: Player) {
    selectCanonicalPlayer(player)
  }

    function handleAcceptTrade(tradeId: string) {
      const offer = tradeOffers.find((trade) => trade.id === tradeId)
      if (!offer) return
      setRoster((current) => {
        const outgoingIds = new Set(offer.receivingAssets.players.map((player) => player.id))
        const incoming = offer.sendingAssets.players
          .filter((player) => !current.some((existing) => existing.id === player.id))
          .map((player) => ({ ...player, slot: "BN" as const }))
        return [...current.filter((player) => !outgoingIds.has(player.id)), ...incoming]
      })
      setTradeOffers((current) => current.map((trade) => trade.id === tradeId ? { ...trade, status: "ACCEPTED" } : trade))
      const added = offer.sendingAssets.players[0]?.name ?? "Players"
      setToast(`Trade accepted! ${added} added to your roster.`)
      window.setTimeout(() => setToast(null), 3000)
    }

    function handleDeclineTrade(tradeId: string) {
      setTradeOffers((current) => current.map((trade) => trade.id === tradeId ? { ...trade, status: "REJECTED" } : trade))
      setToast("Trade offer declined.")
      window.setTimeout(() => setToast(null), 3000)
    }

    function handleCounterTrade(offer: LeagueTradeOffer) {
      const partner = tradePartners.find((candidate) => candidate.name === (offer.isIncoming ? offer.senderTeam : offer.receiverTeam))
      if (!partner) return
      setCounterTrade({
        offer,
        partnerId: partner.id,
        offering: offer.receivingAssets.players.map((player) => player.id),
        receiving: offer.sendingAssets.players.map((player) => player.id),
      })
      setTradeBuilderOpen(true)
    }

    function handleSendTrade(trade: TradeProposal) {
      const assetsToPlayers = (assets: TradeProposal["offering"]) => assets.filter((asset) => asset.kind === "player").map((asset) => asset.player)
      const assetsToPicks = (assets: TradeProposal["offering"]) => assets.filter((asset) => asset.kind === "pick").map((asset) => asset.pick.label)
      setTradeOffers((current) => [...current, {
        id: `offer-${Date.now()}`,
        senderName: "AlexRoy",
        senderTeam: teamName,
        receiverName: trade.to.name,
        receiverTeam: trade.to.name,
        sendingAssets: { players: assetsToPlayers(trade.offering), picks: assetsToPicks(trade.offering), faab: trade.faabFrom },
        receivingAssets: { players: assetsToPlayers(trade.receiving), picks: assetsToPicks(trade.receiving), faab: trade.faabTo },
        status: "ACTIVE",
        timestamp: "Just now",
        isIncoming: false,
      }])
      setCounterTrade(null)
      setTradeBuilderOpen(false)
      setToast(`Trade proposal sent to ${trade.to.name}`)
      window.setTimeout(() => setToast(null), 3000)
    }

  const userTradeTeam: TradeTeam = { id: "montreal-monarchs", name: teamName, abbreviation: "MTL", players: roster, faabAvailable: userFaab, draftPicks: draftPicks.map((pick, index) => ({ id: `pick-${index}`, label: `${pick} Round (MTL)`, detail: "Future dynasty pick" })) }
  const tradePartners: TradeTeam[] = weekMatchups.flatMap((matchup) => [matchup.homeTeam, matchup.awayTeam]).filter((name, index, names) => name !== teamName && names.indexOf(name) === index).map((name) => ({ id: name, name, abbreviation: name.slice(0, 3).toUpperCase(), players: getTeamRoster(name, roster), faabAvailable: 100, draftPicks: ["2027 Rd 1", "2027 Rd 2", "2027 Rd 3", "2028 Rd 1"].map((label, index) => ({ id: `${name}-pick-${index}`, label: `${label} (${name.slice(0, 3).toUpperCase()})`, detail: "Rookie pick" })) }))

  const rosterForDisplay = roster.map((player) => {
    const databasePlayer = allDynastyPlayers.find((candidate) => normalizeSearchText(candidate.name) === normalizeSearchText(player.name))
    return databasePlayer ? {
      ...player,
      nhlGamesPlayed: databasePlayer.nhlGamesPlayed,
      gamesPlayed: databasePlayer.nhlGamesPlayed,
      status: databasePlayer.injuryStatus ?? null,
    } : player
  })
  const startersCount = rosterForDisplay.filter((p) => ["C", "W", "F", "D", "G"].includes(p.slot)).length
  const bench = rosterForDisplay.filter((p) => p.slot === "BN")
  const taxi = rosterForDisplay.filter((p) => p.slot === "TAXI")
  const ir = rosterForDisplay.filter((p) => p.slot === "IR")

  const orderedStarters = startingSlots.flatMap((group) => {
    const players = rosterForDisplay.filter((p) => p.slot === group.slot)
    const emptyCount = Math.max(0, group.capacity - players.length)
    return [
      ...players.map((p) => ({ player: p, slot: group.slot })),
      ...Array.from({ length: emptyCount }, () => ({ player: null, slot: group.slot })),
    ]
  })

  return (
    <div className="flex min-h-screen justify-center bg-black font-sans antialiased">
      <main className="relative flex min-h-0 h-dvh w-full max-w-[430px] flex-col overflow-hidden border-x border-[#121927] bg-[#070a12] shadow-2xl">
        
        {/* Sleeper League Header */}
        <header className="flex items-center justify-between bg-[#070a12] px-3.5 pt-3 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => setDmOpen(true)} aria-label="Open direct messages" className="relative rounded-full p-1 text-zinc-400 hover:bg-[#172338] hover:text-white"><MessageSquare className="size-5" /><span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[#f43f5e] text-[9px] font-black text-white">1</span></button>
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[#22314d] bg-[#162033] text-xs">🏒</div>
            <h1 className="truncate text-sm font-black uppercase tracking-wider text-white">JOHN SCOTT DYNASTY</h1>
          </div>
          <button type="button" className="p-1 text-zinc-400 hover:text-white"><Settings className="size-5" /></button>
        </header>

        {/* 4 Core Tabs */}
        <nav className="flex border-b border-[#141d2f] bg-[#070a12] px-3">
          {(["MATCH", "TEAM", "PLAYERS", "LEAGUE"] as MainTab[]).map((tab) => {
            const active = activeTab === tab
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "relative flex-1 py-2.5 text-center text-xs font-black tracking-widest transition-colors",
                  active ? "text-[#19ffff]" : "text-[#5e7090] hover:text-zinc-300"
                )}
              >
                {tab}
                {active && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-[#19ffff] shadow-[0_0_8px_#19ffff]" />}
              </button>
            )
          })}
        </nav>

        {/* Dynamic Body */}
        <div className={cn("relative z-0 min-h-0 flex flex-1 flex-col pointer-events-auto", activeTab === "LEAGUE" ? "overflow-hidden" : "overflow-y-auto")}>
          {activeTab === "MATCH" && <MatchupPanel roster={roster} players={allDynastyPlayers} teamName={teamName} playerNicknames={playerNicknames} week={week} selectedMatchupId={selectedMatchupId} onMatchupChange={setSelectedMatchupId} onLiveSummary={handleLiveSummary} onWeekChange={setWeek} onMove={handleRosterMove} onSelectPlayer={selectCanonicalPlayer} />}

          {activeTab === "TEAM" && (
            <div className="flex flex-col pb-8">
              <TeamHeader teamName={teamName} pendingClaims={pendingClaims.length} onAction={(action) => {
                if (action === "trade") {
                  setTradeMode(true)
                  setActiveTab("PLAYERS")
                } else setTeamDrawer(action)
              }} />
              {/* Starters Subheader */}
              <div className="flex items-center justify-between border-b border-[#101726] bg-[#070a12] px-3.5 pt-3 pb-2">
                <button type="button" className="flex items-center gap-1 text-xs font-black text-white uppercase tracking-tight">
                  <span>Starters ({startersCount})</span>
                </button>
                <div className="flex items-center gap-1 text-xs font-bold text-[#19ffff]">
                  <button type="button" onClick={() => setWeek((w) => Math.max(1, w - 1))} aria-label="Previous team week" className="rounded p-1 hover:bg-[#172338]">
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span>Week {week}</span>
                  <button type="button" onClick={() => setWeek((w) => w + 1)} aria-label="Next team week" className="rounded p-1 hover:bg-[#172338]">
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Starters Rows */}
              {orderedStarters.map(({ player, slot }, idx) => (
                <PlayerItem
                  key={player ? player.id : `empty-${slot}-${idx}`}
                  player={player}
                  fallbackSlot={slot}
                  onEdit={() => { setEditingPlayer(player); setEditingSlot(player ? null : slot) }}
                  onSelect={() => player && selectCanonicalPlayer(player)}
                  nickname={player ? playerNicknames[player.id] : undefined}
                />
              ))}

              {/* Bench */}
              <div className="border-b border-[#101726] bg-[#070a12] px-3.5 pt-4 pb-2 text-xs font-black text-white uppercase tracking-tight">
                Bench ({bench.length})
              </div>
              {bench.map((player) => (
                <PlayerItem
                  key={player.id}
                  player={player}
                  fallbackSlot="BN"
                  onEdit={() => { setEditingSlot(null); setEditingPlayer(player) }}
                  onSelect={() => selectCanonicalPlayer(player)}
                  nickname={playerNicknames[player.id]}
                />
              ))}

              {/* Injured Reserve */}
              <div className="border-b border-[#101726] bg-[#070a12] px-3.5 pt-4 pb-2 text-xs font-black text-white uppercase tracking-tight">
                Injured Reserve
              </div>
              {ir.length > 0 ? (
                ir.map((player) => (
                  <PlayerItem
                    key={player.id}
                    player={player}
                    fallbackSlot="IR"
                    onEdit={() => setEditingPlayer(player)}
                    onSelect={() => selectCanonicalPlayer(player)}
                    nickname={playerNicknames[player.id]}
                  />
                ))
              ) : (
                <div className="flex items-center gap-2.5 border-b border-[#0f1726] px-3.5 py-2">
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-[5px] text-[11px] font-black uppercase", slotBadgeColors.IR)}>IR</span>
                  <span className="text-xs font-bold text-[#45546d]">Empty</span>
                </div>
              )}

              {/* Taxi Squad */}
              <div className="flex items-center justify-between border-b border-[#101726] bg-[#070a12] px-3.5 pt-4 pb-2 text-xs font-black text-white uppercase tracking-tight">
                <span>Taxi Squad</span>
                <span className="text-[10px] text-amber-400 font-bold">&lt; {TAXI_MAX_NHL_GAMES} NHL GP</span>
              </div>
              {taxi.map((player) => (
                <div key={player.id} className={cn("flex items-center justify-between border-b border-[#0f1726] px-3.5 py-2", (player.nhlGamesPlayed == null || player.nhlGamesPlayed >= TAXI_MAX_NHL_GAMES || player.status === "IR" || player.status === "O" || player.status === "DTD") ? "bg-rose-500/10" : "")}>
                  <div className="flex items-center gap-2.5">
                    <button type="button" onClick={() => setEditingPlayer(player)} className={cn("flex size-7 shrink-0 items-center justify-center rounded-[5px] text-[11px] font-black uppercase", slotBadgeColors.TAXI)}>
                      TX
                    </button>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <PlayerPortrait player={player} name={player.name} className="size-8" />
                      <div>
                      <p className="text-xs font-bold text-white">{player.name}</p>
                      {playerNicknames[player.id] && <p className="text-[10px] italic text-[#5e7090]">{playerNicknames[player.id]}</p>}
                      <p className="text-[10px] text-[#5e7090]">{player.team} • {player.nhlGamesPlayed ?? "—"} NHL GP</p>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-black text-white tabular-nums">0.00</span>
                </div>
              ))}

              {/* Future Draft Picks */}
              <div className="px-3.5 pt-5 pb-2 text-xs font-black text-white uppercase tracking-tight">Draft Picks</div>
              <div className="flex flex-col px-3.5">
                {draftPicks.map((pick, i) => (
                  <div key={i} className="py-2 border-b border-[#0f1726] text-xs font-bold text-[#7d8fa9]">{pick} Round (AlexRoy Std)</div>
                ))}
              </div>

              {/* Watermark */}
              <div className="mt-8 flex items-center justify-center gap-1.5 text-zinc-600 opacity-60">
                <span>⚡</span>
                <span className="text-xs font-black tracking-widest uppercase">sleeper</span>
              </div>
            </div>
          )}

          {activeTab === "PLAYERS" && <PlayersMarketView roster={roster} players={allDynastyPlayers} tradeBlock={tradeBlock} tradeOffers={tradeOffers} onAcceptTrade={handleAcceptTrade} onDeclineTrade={handleDeclineTrade} onCounterTrade={handleCounterTrade} onInitiateTrade={handleInitiateTradeWithPlayer} onSelect={selectCanonicalPlayer} onClaim={setClaimPlayer} onOpenTradeBuilder={() => { setCounterTrade(null); setPrefilledTrade(null); setTradeBuilderOpen(true) }} activeTradeFilter={activeTradeFilter} setActiveTradeFilter={setActiveTradeFilter} tradeMode={tradeMode} />}
          {activeTab === "LEAGUE" && <LeagueFeed week={week} teamName={teamName} teamLogo={teamLogo} onWeekChange={setWeek} onSelectMatchup={(matchupId) => { setSelectedMatchupId(matchupId); setActiveTab("MATCH") }} liveMatchups={liveMatchups} standings={standings} matchups={weekMatchups} activities={activities} roster={roster} players={allDynastyPlayers} onTrade={handleLeagueTrade} onSelectPlayer={handleLeaguePlayer} onSettings={() => setTeamDrawer("settings")} />}
        </div>

        <LeagueChatDrawer
          open={chatOpen}
          onOpenChange={setChatOpen}
          latestPreview={chatPreview}
          onLatestMessage={(message) => setChatPreview(`You: ${message}`)}
        />

        {/* Active Modals */}
        <PlayerDetailDialog player={selectedPlayer} scheduleGames={scheduleGames} open={selectedPlayer !== null} tradeBlockActive={selectedPlayer?.playerId ? tradeBlock.some((entry) => entry.playerId === selectedPlayer.playerId) : false} onToggleTradeBlock={toggleTradeBlock} onInitiateTrade={handleInitiateTradeWithPlayer} onOpenChange={(open) => !open && setSelectedPlayer(null)} onSelectPlayer={setSelectedPlayer} onClaim={(target) => {
          setSelectedPlayer(null)
          if (target.marketPlayer) setClaimPlayer(target.marketPlayer)
        }} />
        <TradeBuilderDialog open={tradeBuilderOpen} onOpenChange={(open) => { setTradeBuilderOpen(open); if (!open) { setCounterTrade(null); setPrefilledTrade(null) } }} team={userTradeTeam} partners={tradePartners} initialPartnerId={counterTrade?.partnerId ?? prefilledTrade?.partnerId} initialOffering={counterTrade?.offering ?? prefilledTrade?.offering} initialReceiving={counterTrade?.receiving ?? prefilledTrade?.receiving} onPlayerClick={(player) => setSelectedPlayer({ ...player, owned: player.team === "MTL", playerId: player.id })} onSendTrade={handleSendTrade} />
        <LineupSlotDialog player={editingPlayer} emptySlot={editingSlot as Extract<Player["slot"], "C" | "W" | "F" | "D" | "G"> | null} roster={roster} open={editingPlayer !== null || editingSlot !== null} onOpenChange={(open) => { if (!open) { setEditingPlayer(null); setEditingSlot(null) } }} onMove={handleRosterMove} />
        <DirectMessagesDialog open={dmOpen} onOpenChange={setDmOpen} onTrade={(conversation) => { const partner = standings.find((team) => team.team === conversation.teamName); if (partner) { setDmOpen(false); handleLeagueTrade(partner) } }} />
        <TeamDrawer
          type={teamDrawer}
          roster={roster}
          playerNicknames={playerNicknames}
          setNickname={(id, value) => setPlayerNicknames((current) => ({ ...current, [id]: value }))}
          onClose={() => setTeamDrawer(null)}
          teamName={teamName}
          setTeamName={setTeamName}
          teamLogo={teamLogo}
          setTeamLogo={setTeamLogo}
          pendingClaims={pendingClaims}
          onCancelClaim={cancelClaim}
        />
        <WaiverClaimDialog player={claimPlayer} roster={roster} userFaab={userFaab} teamName={teamName} open={claimPlayer !== null} onOpenChange={(open) => !open && setClaimPlayer(null)} onConfirm={submitClaim} />
        {toast && <div className="absolute inset-x-4 top-3 z-[60] flex items-center gap-2 rounded-full border border-[#19ffff]/50 bg-[#10283a] px-4 py-3 text-xs font-bold text-white shadow-lg"><Check className="size-4 text-[#19ffff]" />{toast}</div>}
      </main>
    </div>
  )
}
