"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  roster as fallbackRoster, 
  standings as fallbackStandings, 
  draftPicks as fallbackDraftPicks, 
  activities as fallbackActivities,
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
  defaultFaabBudget as fallbackFaabBudget,
  league,
  type TradeBlockEntry,
  type LeagueTradeOffer,
  type MatchupSummary,
  type LiveMatchupSummary,
  getPlayerSchedule,
  TAXI_MAX_NHL_GAMES,
  type NhlScheduleGame,
  type PlayerGameLog,
} from "@/lib/hockey-data"
import { getCurrentFantasyWeek } from "@/lib/season-calendar"
import { MatchupPanel } from "@/components/hockey/matchup-panel"
import { PlayerDetailDialog, type PlayerDialogTarget } from "@/components/hockey/player-detail-dialog"
import { LineupSlotDialog } from "@/components/hockey/lineup-slot-dialog"
import { DirectMessagesDialog } from "@/components/hockey/direct-messages-dialog"
import { LeagueChatDrawer } from "@/components/hockey/league-chat-drawer"
import type { PlayerGridSettings } from "@/components/hockey/player-grid-dialog"
import { WaiverClaimDialog } from "@/components/hockey/waiver-claim-dialog"
import { TransactionsDrawer } from "@/components/hockey/transactions-drawer"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { TradeBuilderDialog, type TradeAsset, type TradeProposal, type TradeTeam } from "@/components/hockey/trade-builder-dialog"
import { LeagueFeed } from "@/components/hockey/league-feed"
import { PlayerItem, slotBadgeColors } from "@/components/hockey/player-item"
import { PlayerPortrait } from "@/components/hockey/player-portrait"
import { TeamHeader } from "@/components/hockey/team-header"
import { TeamDrawer } from "@/components/hockey/team-drawer"
import { PlayersMarketView } from "@/components/hockey/players-market-view"
import { LeagueStandingsView } from "@/components/hockey/league-standings-view"
import { normalizeSearchText } from "@/lib/hockey-calculators"
import type { DashboardInitialData } from "@/lib/dashboard-data"
import { getOrdinal } from "@/components/hockey/team-drawer"
import type { ActivityItem } from "@/lib/hockey-data"

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

export default function SleeperDynastyApp({ initialData }: { initialData: DashboardInitialData }) {
  const initialRoster = initialData.roster.length > 0 ? initialData.roster : fallbackRoster
  const standings = initialData.standings.length > 0 ? initialData.standings : fallbackStandings
  const draftPicks = initialData.draftPicks.length > 0 ? initialData.draftPicks : fallbackDraftPicks
  const [activities, setActivities] = useState<ActivityItem[]>(initialData.activities.length > 0 ? initialData.activities : fallbackActivities)
  const [activeTab, setActiveTab] = useState<MainTab>("TEAM")
  const [allDynastyPlayers, setAllDynastyPlayers] = useState<MarketPlayer[]>([])
  const [scheduleGames, setScheduleGames] = useState<NhlScheduleGame[]>([])
  const [playerGameLogs, setPlayerGameLogs] = useState<Record<string, PlayerGameLog[]>>({})

  function selectCanonicalPlayer(source: Partial<PlayerDialogTarget> & Pick<PlayerDialogTarget, "name">) {
    const playersByNhlId = new Map(allDynastyPlayers.map((player) => [Number(player.nhlId), player]))
    const databasePlayer = (typeof source.playerId === "number" ? playersByNhlId.get(source.playerId) : undefined)
      ?? (source.marketPlayer?.nhlId ? playersByNhlId.get(Number(source.marketPlayer.nhlId)) : undefined)
      ?? allDynastyPlayers.find((candidate) => normalizeSearchText(candidate.name) === normalizeSearchText(source.name))
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

  const [week, setWeek] = useState(getCurrentFantasyWeek())
  const [roster, setRoster] = useState<Player[]>(initialRoster)
  const scheduleGamesRef = useRef<NhlScheduleGame[]>([])
  const playerGameLogsRef = useRef<Record<string, PlayerGameLog[]>>({})

  useEffect(() => {
    let isMounted = true
    fetch(`/api/schedule?week=${week}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((scheduleData: { weekGames?: NhlScheduleGame[]; playerGameLogs?: Record<string, PlayerGameLog[]> } | null) => {
        if (!isMounted) return
        const weekGames = scheduleData?.weekGames ?? []
        const logs = scheduleData?.playerGameLogs ?? {}
        scheduleGamesRef.current = weekGames
        playerGameLogsRef.current = logs
        setScheduleGames(weekGames)
        setPlayerGameLogs(logs)
        setRoster((current) => current.map((player) => {
          const playerLogs = player.nhlId ? logs[String(player.nhlId)] ?? [] : []
          const schedule = getPlayerSchedule(player.team, weekGames, playerLogs, player.position, player.currentSeasonStats, player.projPts, week)
          return {
            ...player,
            schedule: schedule ?? player.schedule,
            todayPts: schedule?.todayFantasyPoints ?? player.todayPts ?? null,
          }
        }))
        setAllDynastyPlayers((current) => current.map((player) => ({
          ...player,
          schedule: getPlayerSchedule(player.team, weekGames, logs[player.nhlId ? String(player.nhlId) : ""] ?? player.gameLog ?? [], player.position, player.currentSeasonStats, player.projection, week),
        })))
      })
      .catch((error: unknown) => console.error("Error hydrating dashboard data:", error))
    return () => { isMounted = false }
  }, [week])
  useEffect(() => {
    const loadUnread = async () => {
      const response = await fetch("/api/messages", { cache: "no-store" })
      if (!response.ok) return
      const conversations = await response.json() as Array<{ unreadCount?: number }>
      setHasUnreadMessages(conversations.some((conversation) => (conversation.unreadCount ?? 0) > 0))
    }
    void loadUnread()
    const timer = window.setInterval(() => { void loadUnread() }, 7000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    let isMounted = true
    fetch(`/api/players?source=complete-database-v2&v=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((playersData: unknown) => {
        if (!isMounted || !Array.isArray(playersData)) return
        const scheduledPlayers = playersData.map((player: MarketPlayer) => ({
          ...player,
          gameLog: [...(player.gameLog ?? []), ...(player.nhlId ? playerGameLogsRef.current[String(player.nhlId)] ?? [] : [])]
            .filter((game, index, games) => games.findIndex((candidate) => candidate.gameId === game.gameId) === index),
          schedule: getPlayerSchedule(
            player.team,
            scheduleGamesRef.current,
            [...(player.gameLog ?? []), ...(player.nhlId ? playerGameLogsRef.current[String(player.nhlId)] ?? [] : [])]
              .filter((game, index, games) => games.findIndex((candidate) => candidate.gameId === game.gameId) === index),
            player.position,
            player.currentSeasonStats,
            player.projection,
            week
          ),
        }))
        setAllDynastyPlayers(scheduledPlayers)
        const playersByNhlId = new Map(scheduledPlayers.map((player) => [Number(player.nhlId), player]))
        const portraitsByName = new Map(scheduledPlayers.map((player) => [normalizeSearchText(player.name), player]))
        setRoster((current) => current.map((player) => {
          const databasePlayer = (player.nhlId ? playersByNhlId.get(Number(player.nhlId)) : undefined)
            ?? portraitsByName.get(normalizeSearchText(player.name))
          if (!databasePlayer) return player
          const playerSchedule = databasePlayer.schedule ?? player.schedule
          return {
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
            todayPts: playerSchedule?.todayFantasyPoints ?? player.todayPts ?? null,
          }
        }))
        const rosterPortraits = initialRoster
          .map((player) => (player.nhlId ? playersByNhlId.get(Number(player.nhlId)) : undefined)?.headshot ?? portraitsByName.get(normalizeSearchText(player.name))?.headshot)
          .filter((headshot): headshot is string => Boolean(headshot))
        preloadPortraits([...new Set([...rosterPortraits, ...scheduledPlayers.slice(0, 50).map((player) => player.headshot).filter((headshot): headshot is string => Boolean(headshot))])])
      })
      .catch((error: unknown) => console.error("Error loading market players:", error))
    return () => { isMounted = false }
  }, [week])
  const [selectedMatchupId, setSelectedMatchupId] = useState(weekMatchups[0].id)
  const [liveMatchups, setLiveMatchups] = useState<Record<string, LiveMatchupSummary>>({})
  const handleLiveSummary = useCallback((summary: LiveMatchupSummary) => {
    setLiveMatchups((current) => ({ ...current, [summary.id]: summary }))
  }, [])
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDialogTarget | null>(null)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [editingSlot, setEditingSlot] = useState<Player["slot"] | null>(null)
  const [dmOpen, setDmOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatPreview, setChatPreview] = useState("No messages yet")
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false)
  const [teamDrawer, setTeamDrawer] = useState<"schedule" | "settings" | "transactions" | "news" | null>(null)
  const [playerNicknames, setPlayerNicknames] = useState<Record<string, string>>({})
  const [tradeMode, setTradeMode] = useState(false)
  const [teamName, setTeamName] = useState(initialData.teamName)
  const [teamLogo, setTeamLogo] = useState(initialData.teamLogo ?? "")
  const [pendingClaims, setPendingClaims] = useState<WaiverClaim[]>([])
  const [userFaab, setUserFaab] = useState(initialData.userFaab ?? fallbackFaabBudget)
  const [claimPlayer, setClaimPlayer] = useState<MarketPlayer | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [tradeBlock, setTradeBlock] = useState<TradeBlockEntry[]>(league.tradeBlock)
  const [tradeBuilderOpen, setTradeBuilderOpen] = useState(false)
  const [activeTradeFilter, setActiveTradeFilter] = useState<"ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED">("ALL")
  const [tradeOffers, setTradeOffers] = useState<LeagueTradeOffer[]>([])
  const [leagueDraftPicks, setLeagueDraftPicks] = useState<Array<{ id: string; season: number; round: number; currentTeamId: string }>>([])
  const [leagueTeams, setLeagueTeams] = useState<Array<{ id: string; name: string }>>([])
  const [counterTrade, setCounterTrade] = useState<{ offer: LeagueTradeOffer; partnerId: string; offering: string[]; receiving: string[] } | null>(null)
  const [prefilledTrade, setPrefilledTrade] = useState<{ partnerId: string; offering: string[]; receiving: string[] } | null>(null)

  const loadActivities = useCallback(async () => {
    if (!initialData.leagueId) return
    const response = await fetch(`/api/activity?leagueId=${encodeURIComponent(initialData.leagueId)}`, { cache: "no-store" })
    if (!response.ok) throw new Error(`Activity request failed with status ${response.status}`)
    const data = await response.json() as { activities?: ActivityItem[] }
    setActivities(data.activities ?? [])
  }, [initialData.leagueId])

  useEffect(() => {
    void loadActivities().catch((error: unknown) => console.error("Failed to load activity feed:", error))
  }, [loadActivities])

  const loadTradeOffers = useCallback(async () => {
    const leagueId = initialData.leagueId
    if (!leagueId || !initialData.teamId) return
    const response = await fetch(`/api/trades?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" })
    if (!response.ok) throw new Error(`Trade offers request failed with status ${response.status}`)
    type TradeApiPlayer = { id: number; name: string; position: "C" | "LW" | "RW" | "D" | "G"; teamAbbrev: string; injuryStatus: PlayerStatus; headshotUrl: string | null; nhlGamesPlayed: number }
    type TradeApiAsset = {
      fromTeamId: string
      toTeamId: string
      assetType: "PLAYER" | "PICK" | "FAAB"
      player: TradeApiPlayer | null
      draftPick: { id: string; season: number; round: number } | null
      faabAmount: number | null
    }
    type TradeApiOffer = {
      id: string
      status: "PENDING" | "ACCEPTED" | "PROCESSED" | "REJECTED" | "CANCELLED"
      createdAt: string
      proposingTeamId: string
      receivingTeamId: string
      proposingTeam: { name: string; manager: { name: string; handle: string } }
      receivingTeam: { name: string; manager: { name: string; handle: string } }
      assets: TradeApiAsset[]
    }
    const data = await response.json() as { offers?: TradeApiOffer[]; picks?: Array<{ id: string; season: number; round: number; currentTeamId: string }>; teams?: Array<{ id: string; name: string }> }
    setLeagueDraftPicks(data.picks ?? [])
    setLeagueTeams(data.teams ?? [])
    const playerForAsset = (player: TradeApiPlayer | null, fromTeamId: string): Player | null => {
      if (!player) return null
      const existingRosterPlayer = roster.find((candidate) => candidate.nhlId === player.id || candidate.name === player.name)
      if (existingRosterPlayer) return existingRosterPlayer
      const existingMarketPlayer = allDynastyPlayers.find((candidate) => candidate.nhlId === player.id || candidate.name === player.name)
      return existingMarketPlayer ? {
        ...existingMarketPlayer,
        id: `nhl-${player.id}`,
        nhlId: player.id,
        slot: "BN" as const,
        opponent: "—",
        gameTime: "—",
        status: player.injuryStatus ?? null,
        todayPts: null,
        projPts: existingMarketPlayer.projection,
      } : {
        id: `nhl-${player.id}`,
        nhlId: player.id,
        name: player.name,
        position: player.position,
        slot: "BN",
        team: player.teamAbbrev,
        opponent: "—",
        gameTime: "—",
        status: player.injuryStatus ?? null,
        todayPts: null,
        projPts: 0,
      }
    }
    const mapAssets = (assets: TradeApiAsset[]) => ({
      players: assets.filter((asset) => asset.assetType === "PLAYER").map((asset) => playerForAsset(asset.player, asset.fromTeamId)).filter((player): player is Player => player !== null),
      picks: assets.filter((asset) => asset.assetType === "PICK" && asset.draftPick).map((asset) => `${asset.draftPick!.season} ${getOrdinal(asset.draftPick!.round)} Round`),
      faab: assets.filter((asset) => asset.assetType === "FAAB").reduce((sum, asset) => sum + (asset.faabAmount ?? 0), 0),
    })
    setTradeOffers((data.offers ?? []).map((offer) => {
      const isIncoming = offer.receivingTeamId === initialData.teamId
      const incomingAssets = mapAssets(offer.assets.filter((asset) => asset.fromTeamId !== initialData.teamId))
      const outgoingAssets = mapAssets(offer.assets.filter((asset) => asset.fromTeamId === initialData.teamId))
      return {
        id: offer.id,
        senderName: offer.proposingTeam.manager.name,
        senderTeam: offer.proposingTeam.name,
        receiverName: offer.receivingTeam.manager.name,
        receiverTeam: offer.receivingTeam.name,
        sendingAssets: isIncoming ? incomingAssets : outgoingAssets,
        receivingAssets: isIncoming ? outgoingAssets : incomingAssets,
        status: offer.status === "PENDING" ? "ACTIVE" : offer.status === "PROCESSED" ? "ACCEPTED" : offer.status === "REJECTED" ? "REJECTED" : "ACCEPTED",
        timestamp: new Date(offer.createdAt).toLocaleString(),
        isIncoming,
      }
    }))
  }, [allDynastyPlayers, initialData.leagueId, initialData.teamId, roster])

  useEffect(() => {
    void loadTradeOffers().catch((error: unknown) => console.error("Failed to load trade offers:", error))
  }, [loadTradeOffers])

  async function saveTeamSettings() {
    if (!initialData.teamId) {
      setToast("Team settings are unavailable until your team is connected to the database.")
      window.setTimeout(() => setToast(null), 3000)
      return
    }
    try {
      const response = await fetch("/api/teams/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: initialData.teamId, name: teamName, logoUrl: teamLogo }),
      })
      if (!response.ok) throw new Error(`Team settings request failed with status ${response.status}`)
      const updated = await response.json() as { name: string; logoUrl: string | null }
      setTeamName(updated.name)
      setTeamLogo(updated.logoUrl ?? "")
      setToast("Team settings saved.")
    } catch (error: unknown) {
      console.error("Failed to save team settings", error)
      setToast("Could not save team settings.")
    }
    window.setTimeout(() => setToast(null), 3000)
  }

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
    if (initialData.teamId) {
      const playerNumId = Number(playerId.replace("nhl-", ""))
      fetch("/api/roster/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: initialData.teamId, playerId: playerNumId, targetSlot: destSlot }),
      }).catch((error: unknown) => console.error("Roster move failed to persist:", error))
    }
    setToast(message)
    window.setTimeout(() => setToast(null), 3000)
  }

  function submitClaim(claim: WaiverClaim) {
    setPendingClaims((current) => [...current, claim])
    setUserFaab((current) => current - claim.bidAmount)
    if (initialData.teamId && claim.playerToAdd.nhlId) {
      void fetch("/api/waivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: initialData.teamId,
          playerToAddId: claim.playerToAdd.nhlId,
          playerToDropId: claim.playerToDrop?.nhlId ?? null,
          bidAmount: claim.bidAmount,
        }),
      }).then((response) => {
        if (!response.ok) throw new Error(`Waiver submission failed with status ${response.status}`)
        return loadActivities()
      }).catch((error: unknown) => console.error("Waiver submission failed to persist:", error))
    }
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

    async function handleAcceptTrade(tradeId: string) {
      const offer = tradeOffers.find((trade) => trade.id === tradeId)
      if (!offer) return
      try {
        const response = await fetch("/api/trades", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tradeOfferId: tradeId, action: "ACCEPT" }),
        })
        if (!response.ok) throw new Error(`Trade acceptance failed with status ${response.status}`)
        const added = offer.sendingAssets.players[0]?.name ?? "Players"
        await loadActivities()
        setToast(`Trade accepted! ${added} added to your roster.`)
        window.location.reload()
      } catch (error: unknown) {
        console.error("Failed to accept trade:", error)
        setToast("Could not accept trade.")
        window.setTimeout(() => setToast(null), 3000)
      }
    }

    async function handleDeclineTrade(tradeId: string) {
      try {
        const response = await fetch("/api/trades", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tradeOfferId: tradeId, action: "REJECT" }),
        })
        if (!response.ok) throw new Error(`Trade rejection failed with status ${response.status}`)
        await Promise.all([loadTradeOffers(), loadActivities()])
        setToast("Trade offer declined.")
        window.setTimeout(() => setToast(null), 3000)
      } catch (error: unknown) {
        console.error("Failed to decline trade:", error)
        setToast("Could not decline trade.")
        window.setTimeout(() => setToast(null), 3000)
      }
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

    async function handleSendTrade(trade: TradeProposal) {
      if (!initialData.teamId) return
      const toAsset = (asset: TradeAsset, fromTeamId: string, toTeamId: string) => ({
        fromTeamId,
        toTeamId,
        assetType: asset.kind === "player" ? "PLAYER" as const : "PICK" as const,
        ...(asset.kind === "player"
          ? { playerId: Number(asset.player.nhlId ?? asset.player.id.replace("nhl-", "")) }
          : { draftPickId: asset.pick.id }),
      })
      const assets = [
        ...trade.offering.map((asset) => toAsset(asset, initialData.teamId!, trade.to.id)),
        ...trade.receiving.map((asset) => toAsset(asset, trade.to.id, initialData.teamId!)),
        ...(trade.faabFrom && trade.faabFrom > 0 ? [{ fromTeamId: initialData.teamId!, toTeamId: trade.to.id, assetType: "FAAB" as const, faabAmount: trade.faabFrom }] : []),
        ...(trade.faabTo && trade.faabTo > 0 ? [{ fromTeamId: trade.to.id, toTeamId: initialData.teamId!, assetType: "FAAB" as const, faabAmount: trade.faabTo }] : []),
      ]
      try {
        const response = await fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leagueId: initialData.leagueId ?? "00000000-0000-0000-0000-000000000001", proposingTeamId: initialData.teamId, receivingTeamId: trade.to.id, assets }),
        })
        if (!response.ok) throw new Error(`Trade proposal failed with status ${response.status}`)
        await Promise.all([loadTradeOffers(), loadActivities()])
        setCounterTrade(null)
        setTradeBuilderOpen(false)
        setToast(`Trade proposal sent to ${trade.to.name}`)
        window.setTimeout(() => setToast(null), 3000)
      } catch (error: unknown) {
        console.error("Failed to send trade:", error)
        setToast("Could not send trade proposal.")
        window.setTimeout(() => setToast(null), 3000)
      }
    }

  const formatPickLabel = (pick: string) => {
    const match = pick.match(/^(\d{4})\s+(\d+)(?:st|nd|rd|th)?(?:\s+Rd)?$/)
    return match ? `${match[1]} ${getOrdinal(Number(match[2]))} Round` : pick
  }
  const userTradeTeam: TradeTeam = { id: initialData.teamId ?? "team", name: teamName, abbreviation: teamName.slice(0, 3).toUpperCase(), players: roster, faabAvailable: userFaab, draftPicks: initialData.draftPickAssets ?? draftPicks.map((pick, index) => ({ id: `pick-${index}`, label: `${formatPickLabel(pick)} (${teamName.slice(0, 3).toUpperCase()})`, detail: "Future dynasty pick" })) }
  const tradePartners: TradeTeam[] = leagueTeams.filter((team) => team.id !== initialData.teamId).map((team) => ({
    id: team.id,
    name: team.name,
    abbreviation: team.name.slice(0, 3).toUpperCase(),
    players: getTeamRoster(team.name, roster),
    faabAvailable: 100,
    draftPicks: leagueDraftPicks.filter((pick) => pick.currentTeamId === team.id).map((pick) => ({ id: pick.id, label: `${pick.season} ${getOrdinal(pick.round)} Round (${team.name.slice(0, 3).toUpperCase()})`, detail: "Rookie pick" })),
  }))

  const playersByNhlId = new Map(allDynastyPlayers.map((player) => [Number(player.nhlId), player]))
  const rosterForDisplay = roster.map((player) => {
    const databasePlayer = (player.nhlId ? playersByNhlId.get(Number(player.nhlId)) : undefined)
      ?? allDynastyPlayers.find((candidate) => normalizeSearchText(candidate.name) === normalizeSearchText(player.name))
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
            <button type="button" onClick={() => setDmOpen(true)} aria-label="Open direct messages" className="relative rounded-full p-1 text-zinc-400 hover:bg-[#172338] hover:text-white"><MessageSquare className="size-5" />{hasUnreadMessages && <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[#f43f5e] text-[9px] font-black text-white">!</span>}</button>
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
              <TeamHeader teamName={teamName} pendingClaims={pendingClaims.length} faabBalance={userFaab} onAction={(action) => {
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
                  <div key={i} className="py-2 border-b border-[#0f1726] text-xs font-bold text-[#7d8fa9]">{formatPickLabel(pick)} ({initialData.managerHandle ?? teamName} Std)</div>
                ))}
              </div>

              {/* Watermark */}
              <div className="mt-8 flex items-center justify-center gap-1.5 text-zinc-600 opacity-60">
                <span>⚡</span>
                <span className="text-xs font-black tracking-widest uppercase">sleeper</span>
              </div>
            </div>
          )}

          {activeTab === "PLAYERS" && <PlayersMarketView teamName={teamName} roster={roster} players={allDynastyPlayers} tradeBlock={tradeBlock} tradeOffers={tradeOffers} onAcceptTrade={handleAcceptTrade} onDeclineTrade={handleDeclineTrade} onCounterTrade={handleCounterTrade} onInitiateTrade={handleInitiateTradeWithPlayer} onSelect={selectCanonicalPlayer} onClaim={setClaimPlayer} onOpenTradeBuilder={() => { setCounterTrade(null); setPrefilledTrade(null); setTradeBuilderOpen(true) }} activeTradeFilter={activeTradeFilter} setActiveTradeFilter={setActiveTradeFilter} tradeMode={tradeMode} />}
          {activeTab === "LEAGUE" && <LeagueFeed week={week} teamName={teamName} teamLogo={teamLogo} onWeekChange={setWeek} onSelectMatchup={(matchupId) => { setSelectedMatchupId(matchupId); setActiveTab("MATCH") }} liveMatchups={liveMatchups} standings={standings} matchups={weekMatchups} activities={activities} roster={roster} players={allDynastyPlayers} onTrade={handleLeagueTrade} onSelectPlayer={handleLeaguePlayer} onSettings={() => setTeamDrawer("settings")} />}
        </div>

        <LeagueChatDrawer
          open={chatOpen}
          onOpenChange={setChatOpen}
          leagueId={initialData.leagueId}
          latestPreview={chatPreview}
          onLatestMessage={(message) => setChatPreview(message)}
        />

        {/* Active Modals */}
        <PlayerDetailDialog player={selectedPlayer} scheduleGames={scheduleGames} open={selectedPlayer !== null} tradeBlockActive={selectedPlayer?.playerId ? tradeBlock.some((entry) => entry.playerId === selectedPlayer.playerId) : false} onToggleTradeBlock={toggleTradeBlock} onInitiateTrade={handleInitiateTradeWithPlayer} onOpenChange={(open) => !open && setSelectedPlayer(null)} onSelectPlayer={setSelectedPlayer} onClaim={(target) => {
          setSelectedPlayer(null)
          if (target.marketPlayer) setClaimPlayer(target.marketPlayer)
        }} />
        <TradeBuilderDialog open={tradeBuilderOpen} onOpenChange={(open) => { setTradeBuilderOpen(open); if (!open) { setCounterTrade(null); setPrefilledTrade(null) } }} team={userTradeTeam} partners={tradePartners} initialPartnerId={counterTrade?.partnerId ?? prefilledTrade?.partnerId} initialOffering={counterTrade?.offering ?? prefilledTrade?.offering} initialReceiving={counterTrade?.receiving ?? prefilledTrade?.receiving} onPlayerClick={(player) => setSelectedPlayer({ ...player, owned: roster.some((rosterPlayer) => rosterPlayer.id === player.id), playerId: player.id })} onSendTrade={handleSendTrade} />
        <LineupSlotDialog player={editingPlayer} emptySlot={editingSlot as Extract<Player["slot"], "C" | "W" | "F" | "D" | "G"> | null} roster={roster} open={editingPlayer !== null || editingSlot !== null} onOpenChange={(open) => { if (!open) { setEditingPlayer(null); setEditingSlot(null) } }} onMove={handleRosterMove} />
        <DirectMessagesDialog open={dmOpen} onOpenChange={setDmOpen} onUnreadChange={setHasUnreadMessages} onTrade={(conversation) => { const partner = standings.find((team) => team.team === conversation.teamName); if (partner) { setDmOpen(false); handleLeagueTrade(partner) } }} />
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
          teamId={initialData.teamId}
          activities={activities}
          onCancelClaim={cancelClaim}
          onSaveSettings={saveTeamSettings}
        />
        <WaiverClaimDialog player={claimPlayer} roster={roster} userFaab={userFaab} teamName={teamName} open={claimPlayer !== null} onOpenChange={(open) => !open && setClaimPlayer(null)} onConfirm={submitClaim} />
        {toast && <div className="absolute inset-x-4 top-3 z-[60] flex items-center gap-2 rounded-full border border-[#19ffff]/50 bg-[#10283a] px-4 py-3 text-xs font-bold text-white shadow-lg"><Check className="size-4 text-[#19ffff]" />{toast}</div>}
      </main>
    </div>
  )
}
