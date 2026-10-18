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
  DEFAULT_ROSTER_SIZE,
  DEFAULT_SLOT_CAPACITIES,
  isStarterSlot,
  getMatchupsForWeek,
  getTeamRoster,
  applyWeekLineup,
  setLeagueContext,
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
import { DEFAULT_BENCH_CAPACITY, displacedLandingSlot } from "@/lib/roster-eligibility"
import { getCurrentFantasyWeek } from "@/lib/season-calendar"
import { useStableCallback } from "@/lib/use-stable-callback"
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
import { motion, useMotionValue, useTransform } from "motion/react"
import { SwipePager, SwipeSurface } from "@/components/hockey/swipe-gestures"
import { PlayerPortrait } from "@/components/hockey/player-portrait"
import { TeamHeader } from "@/components/hockey/team-header"
import { LineupAlerts } from "@/components/hockey/lineup-alerts"
import { TeamDrawer } from "@/components/hockey/team-drawer"
import { PlayersMarketView } from "@/components/hockey/players-market-view"
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

export default function SleeperDynastyApp({ initialData }: { initialData: DashboardInitialData }) {
  const configuredSlots = initialData.league?.rosterPositions
  // Commissioner-configured starting slots (falls back to the default 3C/6W/3F/6D/2G lineup).
  const slotCapacities = useMemo(() => ({
    C: configuredSlots?.C ?? DEFAULT_SLOT_CAPACITIES.C,
    W: configuredSlots?.W ?? DEFAULT_SLOT_CAPACITIES.W,
    F: configuredSlots?.F ?? DEFAULT_SLOT_CAPACITIES.F,
    D: configuredSlots?.D ?? DEFAULT_SLOT_CAPACITIES.D,
    G: configuredSlots?.G ?? DEFAULT_SLOT_CAPACITIES.G,
  }), [configuredSlots])
  const benchCapacity = configuredSlots?.BN ?? DEFAULT_BENCH_CAPACITY
  const startingSlots = useMemo(() => (Object.keys(slotCapacities) as Array<keyof typeof slotCapacities>).map((slot) => ({ slot, capacity: slotCapacities[slot] })), [slotCapacities])
  const rosterSize = initialData.league?.rosterSize ?? DEFAULT_ROSTER_SIZE
  const initialRoster = initialData.roster.length > 0 ? initialData.roster : fallbackRoster
  const standings = initialData.standings.length > 0 ? initialData.standings : fallbackStandings
  // Register authoritative DB rosters before any child derives opponent lineups from them.
  setLeagueContext(initialData.teamName, initialData.leagueRosters)
  const draftPicks = initialData.draftPicks.length > 0 ? initialData.draftPicks : fallbackDraftPicks
  const [activities, setActivities] = useState<ActivityItem[]>(initialData.activities.length > 0 ? initialData.activities : fallbackActivities)
  const [activeTab, setActiveTab] = useState<MainTab>("TEAM")
  const [allDynastyPlayers, setAllDynastyPlayers] = useState<MarketPlayer[]>([])
  const [scheduleGames, setScheduleGames] = useState<NhlScheduleGame[]>([])
  const [playerGameLogs, setPlayerGameLogs] = useState<Record<string, PlayerGameLog[]>>({})

  // Stable identity so memoized lists (roster rows, matchup rows, market grid) don't re-render on every parent render.
  const selectCanonicalPlayer = useStableCallback((source: Partial<PlayerDialogTarget> & Pick<PlayerDialogTarget, "name"> & { nhlId?: number }) => {
    const sourceNhlId = source.marketPlayer?.nhlId ?? source.nhlId
    const databasePlayer = (sourceNhlId ? allDynastyPlayers.find((candidate) => Number(candidate.nhlId) === Number(sourceNhlId)) : undefined)
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
  })

  const [week, setWeek] = useState(getCurrentFantasyWeek())
  const [weekView, setWeekView] = useState<{ frozen: boolean; assignments: Array<{ teamName: string; nhlId: number; slot: string }> } | null>(null)
  const weekRef = useRef(week)
  weekRef.current = week
  const [roster, setRoster] = useState<Player[]>(initialRoster)
  const rosterRef = useRef(roster)
  rosterRef.current = roster
  const allDynastyPlayersRef = useRef(allDynastyPlayers)
  allDynastyPlayersRef.current = allDynastyPlayers
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
            schedule,
            todayPts: schedule?.todayFantasyPoints ?? null,
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
      if (document.visibilityState === "hidden") return
      const response = await fetch("/api/messages?unreadOnly=1", { cache: "no-store" })
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
            weekRef.current
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
  }, [])
  const [selectedMatchupId, setSelectedMatchupId] = useState(() => {
    const weekSchedule = getMatchupsForWeek(getCurrentFantasyWeek())
    return (weekSchedule.find((matchup) => matchup.homeTeam === initialData.teamName || matchup.awayTeam === initialData.teamName) ?? weekSchedule[0]).id
  })
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
  const [teamDrawer, setTeamDrawer] = useState<"schedule" | "team-settings" | "settings" | "transactions" | "news" | null>(null)
  const [playerNicknames, setPlayerNicknames] = useState<Record<string, string>>({})
  const [tradeMode, setTradeMode] = useState(false)
  const [teamName, setTeamName] = useState(initialData.teamName)
  const [teamLogo, setTeamLogo] = useState(initialData.teamLogo ?? "")
  const [pendingClaims, setPendingClaims] = useState<WaiverClaim[]>([])
  useEffect(() => {
    let cancelled = false
    fetch(`/api/roster/week?week=${week}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ frozen: boolean; assignments: Array<{ teamName: string; nhlId: number; slot: string }> }> : null)
      .then((data) => { if (!cancelled) setWeekView(data) })
      .catch((error: unknown) => console.error("Could not load the week lineup", error))
    return () => { cancelled = true }
  }, [week])
  const [userFaab, setUserFaab] = useState(initialData.userFaab ?? fallbackFaabBudget)
  const [claimPlayer, setClaimPlayer] = useState<MarketPlayer | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    const userMatchup = getMatchupsForWeek(week).find((matchup) => matchup.homeTeam === teamName || matchup.awayTeam === teamName)
    if (userMatchup) setSelectedMatchupId(userMatchup.id)
  }, [teamName, week])
  const [tradeBlock, setTradeBlock] = useState<TradeBlockEntry[]>(league.tradeBlock)
  const [tradeBuilderOpen, setTradeBuilderOpen] = useState(false)
  const [activeTradeFilter, setActiveTradeFilter] = useState<"ALL" | "ACTIVE" | "ACCEPTED" | "REJECTED">("ALL")
  const [tradeOffers, setTradeOffers] = useState<LeagueTradeOffer[]>([])
  const [leagueDraftPicks, setLeagueDraftPicks] = useState<Array<{ id: string; season: number; round: number; currentTeamId: string }>>([])
  const [leagueTeams, setLeagueTeams] = useState<Array<{ id: string; name: string; faabBalance?: number }>>([])
  const [counterTrade, setCounterTrade] = useState<{ offer: LeagueTradeOffer; partnerId: string; offering: string[]; receiving: string[] } | null>(null)
  const [prefilledTrade, setPrefilledTrade] = useState<{ partnerId: string; offering: string[]; receiving: string[] } | null>(null)
  // Every player rostered by any of the 12 canonical teams; used to keep them out of the Free Agent list.
  const allLeagueRosterIds = useMemo(() => {
    const ids = new Set<number | string>()
    const addPlayers = (players: Player[]) => {
      players.forEach((player) => {
        if (player.nhlId) ids.add(Number(player.nhlId))
        ids.add(player.id)
        ids.add(player.name)
        ids.add(normalizeSearchText(player.name))
      })
    }
    addPlayers(roster)
    const teamNames = new Set([...standings.map((row) => row.team), ...leagueTeams.map((team) => team.name)])
    teamNames.forEach((name) => addPlayers(getTeamRoster(name, roster, allDynastyPlayers)))
    return ids
  }, [allDynastyPlayers, leagueTeams, roster, standings])

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
      const existingRosterPlayer = rosterRef.current.find((candidate) => candidate.nhlId === player.id || candidate.name === player.name)
      if (existingRosterPlayer) return existingRosterPlayer
      const existingMarketPlayer = allDynastyPlayersRef.current.find((candidate) => candidate.nhlId === player.id || candidate.name === player.name)
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
  }, [initialData.leagueId, initialData.teamId])

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
    const visibleRoster = lineupRef.current.length ? lineupRef.current : roster
    const source = visibleRoster.find((player) => player.id === playerId) ?? roster.find((player) => player.id === playerId)
    const target = targetPlayerId ? visibleRoster.find((player) => player.id === targetPlayerId) ?? roster.find((player) => player.id === targetPlayerId) : undefined
    if (!source) return
    if (weekView?.frozen) {
      setToast("This week's lineup is locked. Switch to a later week to slot players from a trade.")
      window.setTimeout(() => setToast(null), 4000)
      return
    }
    const benchCount = visibleRoster.filter((player) => player.slot === "BN" && player.id !== source.id && player.id !== target?.id).length
    const targetLanding = target ? displacedLandingSlot(source.slot, target.position, benchCount < benchCapacity) : null
    if (target && !targetLanding) {
      setToast(`${target.name} (${target.position}) cannot play ${source.slot}, and the bench is full`)
      window.setTimeout(() => setToast(null), 4000)
      return
    }
    const sourceNext = target ? target.slot : destSlot
    const previousRoster = roster
    const previousWeekView = weekView
    // Optimistic update; rolled back below if the server rejects the move.
    const sourceNhl = Number(source.nhlId)
    const targetNhl = target?.nhlId ? Number(target.nhlId) : undefined
    setRoster((current) => current.map((player) => {
      if (target && targetLanding && player.id === target.id) return { ...player, slot: targetLanding as Player["slot"] }
      if (player.id === source.id) return { ...player, slot: sourceNext }
      return player
    }))
    setWeekView((current) => {
      if (!current || current.frozen) return current
      return {
        ...current,
        assignments: current.assignments.map((entry) => {
          if (entry.teamName !== teamName) return entry
          if (targetNhl !== undefined && targetLanding && entry.nhlId === targetNhl) return { ...entry, slot: targetLanding }
          if (entry.nhlId === sourceNhl) return { ...entry, slot: sourceNext }
          return entry
        }),
      }
    })
    const slotLabel = (slot: string) => slot === "BN" ? "the bench" : slot === "IR" ? "IR" : slot === "TAXI" ? "the taxi squad" : `Starting ${slot}`
    const message = target
      ? targetLanding === source.slot
        ? `Swapped ${source.name} with ${target.name}`
        : `${source.name} moved to ${slotLabel(sourceNext)}. ${target.name} moved to ${slotLabel(targetLanding ?? "BN")}`
      : `${source.name} moved to ${slotLabel(destSlot)}`
    setToast(message)
    if (initialData.teamId) {
      const playerNumId = Number(playerId.replace("nhl-", ""))
      const targetNumId = target ? Number(target.id.replace("nhl-", "")) : undefined
      void fetch("/api/roster/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: initialData.teamId, playerId: playerNumId, targetSlot: target ? target.slot : destSlot, week, ...(targetNumId && Number.isInteger(targetNumId) ? { targetPlayerId: targetNumId } : {}) }),
      }).then(async (response) => {
        if (response.ok) return
        const data = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Move failed (${response.status})`)
      }).catch((error: unknown) => {
        console.error("Roster move failed to persist:", error)
        setRoster(previousRoster)
        setWeekView(previousWeekView)
        setToast(error instanceof Error ? error.message : "Roster move failed")
        window.setTimeout(() => setToast(null), 4000)
      })
    }
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
  // Pass the full player database so partner players resolve to real `nhl-<id>` identifiers for trade proposals.
  const tradePartners: TradeTeam[] = useMemo(() => leagueTeams.filter((team) => team.id !== initialData.teamId).map((team) => ({
    id: team.id,
    name: team.name,
    abbreviation: team.name.slice(0, 3).toUpperCase(),
    players: getTeamRoster(team.name, roster, allDynastyPlayers),
    faabAvailable: team.faabBalance ?? standings.find((row) => row.team === team.name)?.faabRemaining ?? 100,
    draftPicks: leagueDraftPicks.filter((pick) => pick.currentTeamId === team.id).map((pick) => ({ id: pick.id, label: `${pick.season} ${getOrdinal(pick.round)} Round (${team.name.slice(0, 3).toUpperCase()})`, detail: "Rookie pick" })),
  })), [allDynastyPlayers, initialData.teamId, leagueDraftPicks, leagueTeams, roster, standings])

  const lineupRef = useRef(roster)
  const lineupRoster = useMemo(
    () => applyWeekLineup(teamName, roster, allDynastyPlayers, weekView?.assignments ?? null, weekView != null),
    [allDynastyPlayers, roster, teamName, weekView],
  )
  lineupRef.current = lineupRoster
  const { rosterForDisplay, startersCount, bench, taxi, ir, orderedStarters } = useMemo(() => {
    const playersByNhlId = new Map(allDynastyPlayers.map((player) => [Number(player.nhlId), player]))
    const playersByName = new Map(allDynastyPlayers.map((player) => [normalizeSearchText(player.name), player]))
    const display = lineupRoster.map((player) => {
      const databasePlayer = (player.nhlId ? playersByNhlId.get(Number(player.nhlId)) : undefined) ?? playersByName.get(normalizeSearchText(player.name))
      return databasePlayer ? {
        ...player,
        nhlGamesPlayed: databasePlayer.nhlGamesPlayed,
        gamesPlayed: databasePlayer.nhlGamesPlayed,
        status: databasePlayer.injuryStatus ?? null,
      } : player
    })
    return {
      rosterForDisplay: display,
      startersCount: display.filter((p) => isStarterSlot(p.slot)).length,
      bench: display.filter((p) => p.slot === "BN"),
      taxi: display.filter((p) => p.slot === "TAXI"),
      ir: display.filter((p) => p.slot === "IR"),
      orderedStarters: startingSlots.flatMap((group) => {
        const players = display.filter((p) => p.slot === group.slot)
        const emptyCount = Math.max(0, group.capacity - players.length)
        return [
          ...players.map((p) => ({ player: p as Player | null, slot: group.slot })),
          ...Array.from({ length: emptyCount }, () => ({ player: null as Player | null, slot: group.slot })),
        ]
      }),
    }
  }, [allDynastyPlayers, lineupRoster, startingSlots])

  // Stable handler identities for memoized children (PlayerItem, PlayersMarketView, MatchupPanel).
  const onEditRosterSlot = useStableCallback((player: Player | null, fallbackSlot: string) => {
    setEditingPlayer(player)
    setEditingSlot(player || !isStarterSlot(fallbackSlot) ? null : fallbackSlot)
  })
  const onMoveStable = useStableCallback((playerId: string, destSlot: Player["slot"], targetPlayerId?: string) => handleRosterMove(playerId, destSlot, targetPlayerId))
  const onAcceptTradeStable = useStableCallback((tradeId: string) => handleAcceptTrade(tradeId))
  const onDeclineTradeStable = useStableCallback((tradeId: string) => handleDeclineTrade(tradeId))
  const onCounterTradeStable = useStableCallback((offer: LeagueTradeOffer) => handleCounterTrade(offer))
  const onInitiateTradeStable = useStableCallback((player: PlayerDialogTarget) => handleInitiateTradeWithPlayer(player))
  const onOpenTradeBuilderStable = useStableCallback(() => { setCounterTrade(null); setPrefilledTrade(null); setTradeBuilderOpen(true) })
  const mainTabs: MainTab[] = ["MATCH", "TEAM", "PLAYERS", "LEAGUE"]
  const activeTabIndex = mainTabs.indexOf(activeTab)
  const tabProgress = useMotionValue(activeTabIndex)
  const underlineX = useTransform(tabProgress, (value) => `${value * 100}%`)
  const shiftWeek = (step: number) => setWeek((current) => Math.max(1, current + step))
  const renderRosterRow = (player: Player) => (
    <PlayerItem key={player.id} player={player} fallbackSlot={player.slot} onEdit={onEditRosterSlot} onSelect={selectCanonicalPlayer} nickname={playerNicknames[player.id]} />
  )

  return (
    <div className="flex min-h-screen justify-center bg-black font-sans antialiased">
      <main className="relative flex min-h-0 h-dvh w-full max-w-[430px] flex-col overflow-hidden border-x border-[#121927] bg-[#070a12] shadow-2xl">
        
        {/* Sleeper League Header */}
        <header className="flex items-center justify-between bg-[#070a12] px-3.5 pt-3 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => setDmOpen(true)} aria-label="Open direct messages" className="relative rounded-full p-1 text-zinc-400 hover:bg-[#172338] hover:text-white"><MessageSquare className="size-5" />{hasUnreadMessages && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#f43f5e] text-xs font-black text-white">!</span>}</button>
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[#22314d] bg-[#162033] text-xs">🏒</div>
            <h1 className="truncate text-sm font-black uppercase tracking-wider text-white">JOHN SCOTT DYNASTY</h1>
          </div>
          <button type="button" onClick={() => setTeamDrawer("settings")} aria-label="League & Team Settings" className="p-1 text-zinc-400 transition hover:text-white"><Settings className="size-5" /></button>
        </header>

        {/* 4 Core Tabs */}
        <nav className="border-b border-[#141d2f] bg-[#070a12]">
          <div className="relative mx-3 flex">
            {mainTabs.map((tab) => {
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
                </button>
              )
            })}
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 h-[3px] w-1/4 rounded-full bg-[#19ffff] shadow-[0_0_8px_#19ffff]"
              style={{ x: underlineX }}
            />
          </div>
        </nav>

        {/* Dynamic Body */}
        <SwipePager
          zone="tab"
          fill
          activeIndex={activeTabIndex}
          itemCount={mainTabs.length}
          onIndexChange={(index) => {
            const next = mainTabs[index]
            if (next) setActiveTab(next)
          }}
          onProgressChange={tabProgress}
          className="relative z-0 min-h-0 min-w-0 flex-1 pointer-events-auto"
        >
          <div className="h-full min-h-0 w-full shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain" aria-hidden={activeTab !== "MATCH"} inert={activeTab !== "MATCH"}>
            <MatchupPanel matchupResults={initialData.matchupResults} roster={lineupRoster} players={allDynastyPlayers} teamName={teamName} playerNicknames={playerNicknames} week={week} weekLineup={weekView} selectedMatchupId={selectedMatchupId} onMatchupChange={setSelectedMatchupId} onLiveSummary={handleLiveSummary} onWeekChange={setWeek} slotCapacities={slotCapacities} onMove={onMoveStable} onSelectPlayer={selectCanonicalPlayer} />
          </div>

          <div className="h-full min-h-0 w-full shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain" aria-hidden={activeTab !== "TEAM"} inert={activeTab !== "TEAM"}>
            <div className="flex flex-col pb-16">
              <TeamHeader teamName={teamName} logoUrl={teamLogo} standing={standings.find((row) => row.team === teamName)} rank={standings.findIndex((row) => row.team === teamName) + 1} pendingClaims={pendingClaims.length} faabBalance={userFaab} onAction={(action) => {
                if (action === "trade") {
                  setTradeMode(true)
                  setActiveTab("PLAYERS")
                } else setTeamDrawer(action)
              }} />
              <LineupAlerts roster={roster} capacities={slotCapacities} irSlots={initialData.league?.irSlots ?? 1} lock={initialData.lineupLock} />
              {/* Starters Subheader */}
              <div className="flex items-center justify-between border-b border-[#101726] bg-[#070a12] px-3.5 pt-3 pb-2">
                <button type="button" className="flex items-center gap-1 text-xs font-black text-white uppercase tracking-tight">
                  <span>Starters ({startersCount})</span>
                </button>
                <SwipeSurface zone="week" onSwipeLeft={() => shiftWeek(1)} onSwipeRight={() => shiftWeek(-1)} className="flex items-center gap-1 text-xs font-bold text-[#19ffff]">
                  <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous team week" className="rounded p-1 hover:bg-[#172338]">
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span>Week {week}</span>
                  {weekView?.frozen && <span className="ml-1 text-xs font-black uppercase text-[#5e7090]">Locked</span>}
                  <button type="button" onClick={() => shiftWeek(1)} aria-label="Next team week" className="rounded p-1 hover:bg-[#172338]">
                    <ChevronRight className="size-3.5" />
                  </button>
                </SwipeSurface>
              </div>
              {weekView?.frozen ? (
                <p className="border-b border-[#101726] bg-[#070a12] px-3.5 py-2 text-xs leading-relaxed text-[#8ba0c7]">This week is locked. Switch to a later week to slot players from a trade.</p>
              ) : week > (initialData.lineupLock?.week ?? week) ? (
                <p className="border-b border-[#101726] bg-[#070a12] px-3.5 py-2 text-xs leading-relaxed text-[#8ba0c7]">Week {week} lineup. Players from a trade can be moved here before this week locks.</p>
              ) : null}

              {/* Starters Rows */}
              {orderedStarters.map(({ player, slot }, idx) => player ? renderRosterRow(player) : (
                <PlayerItem
                  key={`empty-${slot}-${idx}`}
                  player={null}
                  fallbackSlot={slot}
                  onEdit={onEditRosterSlot}
                  onSelect={selectCanonicalPlayer}
                />
              ))}

              {/* Bench */}
              <div className="border-b border-[#101726] bg-[#070a12] px-3.5 pt-4 pb-2 text-xs font-black text-white uppercase tracking-tight">
                Bench ({bench.length})
              </div>
              {bench.map((player) => renderRosterRow(player))}

              {/* Injured Reserve */}
              <div className="border-b border-[#101726] bg-[#070a12] px-3.5 pt-4 pb-2 text-xs font-black text-white uppercase tracking-tight">
                Injured Reserve
              </div>
              {ir.length > 0 ? (
                ir.map((player) => renderRosterRow(player))
              ) : (
                <div className="flex items-center gap-2.5 border-b border-[#0f1726] px-3.5 py-2">
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-[5px] text-xs font-black uppercase", slotBadgeColors.IR)}>IR</span>
                  <span className="text-xs font-bold text-[#45546d]">Empty</span>
                </div>
              )}

              {/* Taxi Squad */}
              <div className="flex items-center justify-between border-b border-[#101726] bg-[#070a12] px-3.5 pt-4 pb-2 text-xs font-black text-white uppercase tracking-tight">
                <span>Taxi Squad</span>
                <span className="text-xs text-amber-400 font-bold">&lt; {initialData.league?.taxiMaxGames ?? TAXI_MAX_NHL_GAMES} NHL GP</span>
              </div>
              {taxi.map((player) => (
                <div key={player.id} className={cn("flex items-center justify-between border-b border-[#0f1726] bg-[#070a12] px-3.5 py-2", (player.nhlGamesPlayed == null || player.nhlGamesPlayed >= (initialData.league?.taxiMaxGames ?? TAXI_MAX_NHL_GAMES)) ? "bg-rose-500/10" : "")}>
                  <div className="flex items-center gap-2.5">
                    <button type="button" onClick={() => setEditingPlayer(player)} className={cn("flex size-7 shrink-0 items-center justify-center rounded-[5px] text-xs font-black uppercase", slotBadgeColors.TAXI)}>
                      TX
                    </button>
                    <button type="button" onClick={() => selectCanonicalPlayer(player)} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 text-left">
                      <PlayerPortrait player={player} name={player.name} className="size-8" />
                      <div>
                      <p className="text-xs font-bold text-white">{player.name}</p>
                      {playerNicknames[player.id] && <p className="text-xs italic text-[#5e7090]">{playerNicknames[player.id]}</p>}
                      <p className="text-xs text-[#5e7090]">{player.team} • {player.nhlGamesPlayed ?? "—"} NHL GP</p>
                      </div>
                    </button>
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
          </div>

          <div className="h-full min-h-0 w-full shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain" aria-hidden={activeTab !== "PLAYERS"} inert={activeTab !== "PLAYERS"}>
            <PlayersMarketView teamName={teamName} roster={roster} players={allDynastyPlayers} allLeagueRosterIds={allLeagueRosterIds} tradeBlock={tradeBlock} tradeOffers={tradeOffers} onAcceptTrade={onAcceptTradeStable} onDeclineTrade={onDeclineTradeStable} onCounterTrade={onCounterTradeStable} onInitiateTrade={onInitiateTradeStable} onSelect={selectCanonicalPlayer} onClaim={setClaimPlayer} onOpenTradeBuilder={onOpenTradeBuilderStable} activeTradeFilter={activeTradeFilter} setActiveTradeFilter={setActiveTradeFilter} tradeMode={tradeMode} />
          </div>
          <div className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden" aria-hidden={activeTab !== "LEAGUE"} inert={activeTab !== "LEAGUE"}>
            <LeagueFeed matchupResults={initialData.matchupResults} week={week} teamName={teamName} teamLogo={teamLogo} isCommissioner={initialData.isCommissioner} onWeekChange={setWeek} onSelectMatchup={(matchupId) => { setSelectedMatchupId(matchupId); setActiveTab("MATCH") }} liveMatchups={liveMatchups} standings={standings} activities={activities} roster={roster} players={allDynastyPlayers} onTrade={handleLeagueTrade} onSelectPlayer={handleLeaguePlayer} onSettings={() => setTeamDrawer("settings")} />
          </div>
        </SwipePager>

        <div className="absolute inset-x-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20">
          <button type="button" onClick={() => setChatOpen(true)} aria-label="Open league chat" className="flex w-full items-center gap-2 rounded-full border border-[#1e2d47] bg-[#0c1424]/95 px-3.5 py-2 text-left text-xs shadow-lg backdrop-blur transition hover:border-[#19ffff]/50">
            <MessageSquare className="size-3.5 shrink-0 text-[#19ffff]" />
            <span className="truncate text-xs text-[#8ba0c7]"><b className="text-white">Chat:</b> {chatPreview}</span>
          </button>
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
        <LineupSlotDialog player={editingPlayer} emptySlot={editingSlot as Extract<Player["slot"], "C" | "W" | "F" | "D" | "G"> | null} roster={lineupRoster} capacities={slotCapacities} irSlots={initialData.league?.irSlots ?? 1} benchCapacity={benchCapacity} open={editingPlayer !== null || editingSlot !== null} onOpenChange={(open) => { if (!open) { setEditingPlayer(null); setEditingSlot(null) } }} onMove={handleRosterMove} />
        <DirectMessagesDialog open={dmOpen} onOpenChange={setDmOpen} onUnreadChange={setHasUnreadMessages} onTrade={(conversation) => { const partner = standings.find((team) => team.team === conversation.teamName); if (partner) { setDmOpen(false); handleLeagueTrade(partner) } }} />
        <TeamDrawer
          type={teamDrawer}
          rank={standings.findIndex((row) => row.team === teamName) + 1}
          faab={userFaab}
          waiverPriority={initialData.waiverPriority}
          roster={roster}
          playerNicknames={playerNicknames}
          setNickname={(id, value) => setPlayerNicknames((current) => ({ ...current, [id]: value }))}
          onClose={() => setTeamDrawer(null)}
          teamName={teamName}
          setTeamName={setTeamName}
          teamLogo={teamLogo}
          setTeamLogo={setTeamLogo}
          managerHandle={initialData.managerHandle}
          isCommissioner={initialData.isCommissioner}
          pendingClaims={pendingClaims}
          teamId={initialData.teamId}
          activities={activities}
          onCancelClaim={cancelClaim}
          onSaveSettings={saveTeamSettings}
        />
        <WaiverClaimDialog player={claimPlayer} roster={roster} rosterSize={rosterSize} userFaab={userFaab} teamName={teamName} teamId={initialData.teamId} weekLocked={initialData.lineupLock?.locked === true && initialData.lineupLock.mode !== "DAILY"} open={claimPlayer !== null} onOpenChange={(open) => !open && setClaimPlayer(null)} onConfirm={submitClaim} />
        {toast && <div className="absolute inset-x-4 top-3 z-[60] flex items-center gap-2 rounded-full border border-[#19ffff]/50 bg-[#10283a] px-4 py-3 text-xs font-bold text-white shadow-lg"><Check className="size-4 text-[#19ffff]" />{toast}</div>}
      </main>
    </div>
  )
}
