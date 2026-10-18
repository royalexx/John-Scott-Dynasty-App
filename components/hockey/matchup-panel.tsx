"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  applyWeekLineup,
  DEFAULT_SLOT_CAPACITIES,
  STARTER_SLOTS,
  getTeamRoster,
  getWeekActualPoints,
  getWeekMatchups,
  getWeekProjectedPoints,
  isStarterSlot,
  type LiveMatchupSummary,
  type MatchupPlayer,
  type MarketPlayer,
  type MatchupSummary,
  type Player,
  type StarterSlot,
} from "@/lib/hockey-data"
import type { MatchupResult } from "@/lib/dashboard-data"
import { SwipePager, SwipeSurface } from "@/components/hockey/swipe-gestures"
import { LineupSlotDialog } from "@/components/hockey/lineup-slot-dialog"
import { MatchupBanner } from "@/components/hockey/matchup-banner"
import { PlayerRow } from "@/components/hockey/player-row"

type ReserveSlot = "BN" | "TAXI" | "IR"
/** A selected lineup player; `ownerName` is set when the player belongs to the opposing team. */
export type LineupPlayerSelection = Player & { ownerName?: string }

const slotColors: Record<StarterSlot, string> = {
  C: "bg-[#3b4cca]",
  W: "bg-[#0d9488]",
  F: "bg-[#7c3aed]",
  D: "bg-[#b45309]",
  G: "bg-[#0284c7]",
}
const statusStyles: Record<string, string> = {
  IR: "bg-[#3b1824] text-[#ff2a85]",
  TAXI: "bg-[#1a253b] text-[#5e7090]",
  O: "bg-[#3b1824] text-[#ff2a85]",
  DTD: "bg-amber-400/15 text-amber-300",
}

export function getYetToPlayText(teamRoster: Player[]): string {
  const counts: Record<StarterSlot, number> = { C: 0, W: 0, F: 0, D: 0, G: 0 }
  teamRoster
    .filter((player) => isStarterSlot(player.slot))
    .filter((player) => player.gameState !== "Final" && player.status !== "O" && player.status !== "IR")
    .forEach((player) => {
      counts[player.slot as StarterSlot] += 1
    })
  const parts = STARTER_SLOTS.filter((slot) => counts[slot] > 0).map((slot) => `${counts[slot]} ${slot}`)
  return `yet to play: ${parts.length ? parts.join(", ") : "none"}`
}

type WeekLineup = { frozen: boolean; assignments: Array<{ teamName: string; nhlId: number; slot: string }> } | null

function buildMatchupCard(
  summary: MatchupSummary,
  teamName: string,
  roster: Player[],
  players: MarketPlayer[] | undefined,
  week: number,
  weekLineup: WeekLineup,
  matchupResults: MatchupResult[],
) {
  const flip = summary.awayTeam === teamName
  const market = players ?? []
  const assignments = weekLineup?.assignments ?? null
  const frozen = weekLineup != null
  const trueHomeRoster = applyWeekLineup(summary.homeTeam, getTeamRoster(summary.homeTeam, roster, market), market, assignments, frozen)
  const trueAwayRoster = applyWeekLineup(summary.awayTeam, getTeamRoster(summary.awayTeam, roster, market), market, assignments, frozen)
  const starters = (list: Player[]) => list.filter((player) => isStarterSlot(player.slot))
  const expected = (list: Player[]) => starters(list).reduce((sum, player) => sum + (getWeekProjectedPoints(player, week) ?? 0), 0)
  const actual = (list: Player[]) => starters(list).reduce((sum, player) => sum + getWeekActualPoints(player, week), 0)
  const gamesLeft = (list: Player[]) => starters(list).filter((player) => player.gameState !== "Final").length
  const finalResult = matchupResults.find((result) => result.week === week && result.isFinal && result.homeTeam === summary.homeTeam && result.awayTeam === summary.awayTeam)
  const trueHomeScore = finalResult ? finalResult.homeScore : actual(trueHomeRoster)
  const trueAwayScore = finalResult ? finalResult.awayScore : actual(trueAwayRoster)
  const trueProjectedHome = expected(trueHomeRoster)
  const trueProjectedAway = expected(trueAwayRoster)
  const trueHomeGamesLeft = gamesLeft(trueHomeRoster)
  const trueAwayGamesLeft = gamesLeft(trueAwayRoster)
  const display = flip
    ? {
        ...summary,
        homeTeam: summary.awayTeam,
        homeOwner: summary.awayOwner,
        homeRecord: summary.awayRecord,
        homeScore: summary.awayScore,
        awayTeam: summary.homeTeam,
        awayOwner: summary.homeOwner,
        awayRecord: summary.homeRecord,
        awayScore: summary.homeScore,
      }
    : summary
  const status = finalResult ? "Final" : summary.status
  return {
    id: summary.id,
    isUserMatchup: summary.homeTeam === teamName || summary.awayTeam === teamName,
    homeRoster: flip ? trueAwayRoster : trueHomeRoster,
    awayRoster: flip ? trueHomeRoster : trueAwayRoster,
    banner: {
      ...display,
      homeScore: flip ? trueAwayScore : trueHomeScore,
      awayScore: flip ? trueHomeScore : trueAwayScore,
      status,
    },
    projectedHome: flip ? trueProjectedAway : trueProjectedHome,
    projectedAway: flip ? trueProjectedHome : trueProjectedAway,
    homeGamesLeft: flip ? trueAwayGamesLeft : trueHomeGamesLeft,
    awayGamesLeft: flip ? trueHomeGamesLeft : trueAwayGamesLeft,
    live: {
      ...summary,
      homeScore: trueHomeScore,
      awayScore: trueAwayScore,
      status,
      projectedHome: trueProjectedHome,
      projectedAway: trueProjectedAway,
    },
  }
}

function emptyPlayer(slot: StarterSlot): MatchupPlayer {
  return {
    name: "",
    position: slot === "W" || slot === "F" ? "C" : slot,
    team: "",
    opponent: "",
    status: null,
    todayPts: null,
    projPts: 0,
    empty: true,
  }
}

const PlayerSide = React.memo(function PlayerSide({
  player,
  align,
  onSelect,
  nickname,
}: {
  player: MatchupPlayer
  align: "left" | "right"
  onSelect: (player: MatchupPlayer) => void
  nickname?: string
}) {
  if (player.empty) {
    return <div className={cn("min-w-0 text-xs text-[#5e7090]", align === "left" ? "text-right" : "text-left")}>Empty slot</div>
  }
  return (
    <button
      type="button"
      data-testid={align === "right" ? "away-player" : "home-player"}
      onClick={() => onSelect(player)}
      className={cn("w-full min-w-0 rounded-md px-1 py-1 hover:bg-[#101a2e]", align === "left" ? "text-right" : "text-left")}
    >
      <div className={cn("flex items-center gap-1.5", align === "left" ? "justify-end" : "justify-start")}>
        {align === "left" && player.status && <span className={cn("rounded px-1 py-0.5 text-xs font-black", statusStyles[player.status])}>{player.status}</span>}
        <span className="truncate text-sm font-bold text-white">{player.name}</span>
        {align === "right" && player.status && <span className={cn("rounded px-1 py-0.5 text-xs font-black", statusStyles[player.status])}>{player.status}</span>}
      </div>
      {nickname && <p className="truncate text-xs italic text-[#5e7090]">{nickname}</p>}
      <p className="truncate text-xs text-[#5e7090]">
        {player.schedule
          ? align === "left"
            ? `${player.schedule.day} ${player.schedule.time} · ${player.schedule.opponent} · ${player.team}`
            : `${player.team} · ${player.schedule.opponent} · ${player.schedule.day} ${player.schedule.time}`
          : "No game this week"}
      </p>
    </button>
  )
})

/** Points actually scored this week. Unplayed games, missing schedules and other-week schedules are always 0.0. */
export function getActualPoints(player: MatchupPlayer | Player | null, week?: number): string {
  if (!player) return "—"
  return getWeekActualPoints(player, week).toFixed(1)
}

/** Weekly projection, shown separately from actual points. */
export function getProjectedPoints(player: MatchupPlayer | Player | null, week?: number): string {
  if (!player) return "—"
  const projected = getWeekProjectedPoints(player, week)
  return projected === null ? "—" : projected.toFixed(1)
}

const Score = React.memo(function Score({ player, align, week }: { player: MatchupPlayer; align: "left" | "right"; week: number }) {
  return (
    <div className={cn("w-full shrink-0", align === "left" ? "pr-2 text-right" : "pl-2 text-left")}>
      <p className="text-sm font-bold tabular-nums text-white">{player.empty ? "—" : getActualPoints(player, week)}</p>
      <p className="text-xs leading-tight text-[#5e7090]">
        <span className="block">proj</span>
        <span className="block tabular-nums">{player.empty ? "—" : getProjectedPoints(player, week)}</span>
      </p>
    </div>
  )
})

const PlayerStats = React.memo(function PlayerStats({ player, align }: { player: MatchupPlayer; align: "left" | "right" }) {
  const game = player.gameLog?.find((entry) => entry.gameDate === player.schedule?.date) ?? player.gameLog?.[0]
  const current = player.currentSeasonStats
  const stats = player.position === "G"
    ? [
        game?.decision === "W" || (!game && (current?.wins ?? 0) > 0) ? `${game ? "W" : current?.wins} W` : null,
        game ? game.shotsAgainst - game.goalsAgainst > 0 ? `${game.shotsAgainst - game.goalsAgainst} SV` : null : (current?.saves ?? 0) > 0 ? `${current?.saves} SV` : null,
        game ? game.goalsAgainst > 0 ? `${game.goalsAgainst} GA` : null : (current?.goalsAgainst ?? 0) > 0 ? `${current?.goalsAgainst} GA` : null,
        game ? game.shutouts > 0 ? `${game.shutouts} SO` : null : (current?.shutouts ?? 0) > 0 ? `${current?.shutouts} SO` : null,
      ].filter(Boolean).join(", ")
    : [
        game ? game.goals > 0 ? `${game.goals} G` : null : (current?.goals ?? 0) > 0 ? `${current?.goals} G` : null,
        game ? game.assists > 0 ? `${game.assists} A` : null : (current?.assists ?? 0) > 0 ? `${current?.assists} A` : null,
        game ? game.shots > 0 ? `${game.shots} SOG` : null : (current?.shots ?? 0) > 0 ? `${current?.shots} SOG` : null,
        game ? game.hits > 0 ? `${game.hits} HIT` : null : (current?.hits ?? 0) > 0 ? `${current?.hits} HIT` : null,
        game ? game.blocks > 0 ? `${game.blocks} BLK` : null : (current?.blocks ?? 0) > 0 ? `${current?.blocks} BLK` : null,
        game ? game.gameWinningGoals > 0 ? `${game.gameWinningGoals} GWG` : null : (current?.gameWinningGoals ?? 0) > 0 ? `${current?.gameWinningGoals} GWG` : null,
      ].filter(Boolean).join(", ")
  return (
    <p className={cn("truncate text-xs text-[#5e7090]", align === "left" ? "text-right" : "text-left")}>
      {stats || "No game stats"}
    </p>
  )
})

const Reserves = React.memo(function Reserves({
  homeRoster,
  awayRoster,
  teamName,
  opponentName,
  onEdit,
  onSelectHome,
  onSelectAway,
}: {
  homeRoster: Player[]
  awayRoster: Player[]
  teamName: string
  opponentName: string
  onEdit: (player: Player) => void
  onSelectHome: (player: Player) => void
  onSelectAway: (player: Player) => void
}) {
  const [open, setOpen] = useState(true)
  const groups: Array<{ slot: ReserveSlot; label: string }> = [
    { slot: "BN", label: "Bench" },
    { slot: "TAXI", label: "Taxi Squad" },
    { slot: "IR", label: "Injured Reserve" },
  ]
  return (
    <section className="overflow-hidden border-y border-[#111929] bg-[#080c14]">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center justify-between border-b border-[#111929] px-3 py-3 text-left">
        <span><b className="block text-sm text-white">Bench & Reserves</b><small className="text-xs text-[#5e7090]">BN · TAXI · IR</small></span>
        <ChevronDown className={cn("size-5 text-[#5e7090] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="grid grid-cols-2 border-b border-[#111929] px-3 py-2 text-xs font-bold text-[#5e7090]"><span>{teamName}</span><span className="text-right">{opponentName}</span></div>
          {groups.map(({ slot, label }) => {
            const home = homeRoster.filter((player) => player.slot === slot)
            const away = awayRoster.filter((player) => player.slot === slot)
            return (
              <div key={slot} className="grid grid-cols-2 border-b border-[#111929] last:border-0">
                <div className="border-r border-[#111929]">
                  <p className="px-3 py-2 text-xs font-black uppercase tracking-wider text-[#5e7090]">{label}</p>
                  {home.length ? home.map((player) => <PlayerRow key={player.id} player={player} onSelect={onSelectHome} onEditSlot={() => onEdit(player)} />) : <p className="px-3 pb-3 text-xs text-[#5e7090]">Empty</p>}
                </div>
                <div>
                  <p className="px-3 py-2 text-right text-xs font-black uppercase tracking-wider text-[#5e7090]">{label}</p>
                  {away.length ? away.map((player) => <PlayerRow key={player.id} player={player} onSelect={onSelectAway} />) : <p className="px-3 pb-3 text-right text-xs text-[#5e7090]">Empty</p>}
                </div>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
})

export const MatchupPanel = React.memo(function MatchupPanel({
  roster,
  players,
  teamName,
  playerNicknames,
  slotCapacities = DEFAULT_SLOT_CAPACITIES,
  onMove,
  onSelectPlayer,
  onEditSlot,
  week,
  onWeekChange,
  selectedMatchupId: controlledMatchupId,
  onMatchupChange,
  onLiveSummary,
  matchupResults = [],
  weekLineup = null,
}: {
  roster: Player[]
  players?: MarketPlayer[]
  teamName: string
  playerNicknames: Record<string, string>
  slotCapacities?: Record<StarterSlot, number>
  onMove: (playerId: string, destSlot: Player["slot"], targetPlayerId?: string) => void
  onSelectPlayer?: (player: LineupPlayerSelection) => void
  onEditSlot?: (player: Player) => void
  week: number
  onWeekChange: (week: number) => void
  selectedMatchupId?: string
  onMatchupChange?: (matchupId: string) => void
  onLiveSummary?: (summary: LiveMatchupSummary) => void
  matchupResults?: MatchupResult[]
  weekLineup?: { frozen: boolean; assignments: Array<{ teamName: string; nhlId: number; slot: string }> } | null
}) {
  const weekSchedule = useMemo(() => getWeekMatchups(week), [week])
  const userMatchup = useMemo(
    () => weekSchedule.find((matchup) => matchup.homeTeam === teamName || matchup.awayTeam === teamName) ?? weekSchedule[0],
    [weekSchedule, teamName],
  )
  const [localMatchupId, setLocalMatchupId] = useState(userMatchup.id)
  // A controlled id from a different week must never be rendered: fall back to the user's matchup.
  const selectedMatchupId = controlledMatchupId && weekSchedule.some((matchup) => matchup.id === controlledMatchupId)
    ? controlledMatchupId
    : controlledMatchupId === undefined && weekSchedule.some((matchup) => matchup.id === localMatchupId)
      ? localMatchupId
      : userMatchup.id
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)

  const setSelectedMatchupId = useCallback((id: string) => {
    if (controlledMatchupId === undefined) setLocalMatchupId(id)
    onMatchupChange?.(id)
  }, [controlledMatchupId, onMatchupChange])

  // Snap back to the user's own matchup when the week changes (but not on first mount,
  // so a matchup chosen from the league feed is preserved).
  const previousWeek = useRef(week)
  useEffect(() => {
    if (previousWeek.current === week) return
    previousWeek.current = week
    setSelectedMatchupId(userMatchup.id)
  }, [week, userMatchup.id, setSelectedMatchupId])

  const matchupIndex = Math.max(0, weekSchedule.findIndex((matchup) => matchup.id === selectedMatchupId))
  const cards = useMemo(
    () => weekSchedule.map((summary) => buildMatchupCard(summary, teamName, roster, players, week, weekLineup, matchupResults)),
    [matchupResults, players, roster, teamName, week, weekLineup, weekSchedule],
  )
  const card = cards[matchupIndex] ?? cards[0]
  const homeRoster = card?.homeRoster ?? []
  const awayRoster = card?.awayRoster ?? []
  const isUserMatchup = card?.isUserMatchup ?? false

  const rows = useMemo(() => STARTER_SLOTS.flatMap((slot) => {
    const homePlayers = homeRoster.filter((player) => player.slot === slot)
    const awayPlayers = awayRoster.filter((player) => player.slot === slot)
    return Array.from({ length: slotCapacities[slot] ?? 0 }, (_, index) => ({
      slot,
      home: (homePlayers[index] ?? emptyPlayer(slot)) as MatchupPlayer,
      away: (awayPlayers[index] ?? emptyPlayer(slot)) as MatchupPlayer,
      homeSource: homePlayers[index] as Player | undefined,
      awaySource: awayPlayers[index] as Player | undefined,
    }))
  }), [awayRoster, homeRoster, slotCapacities])

  useEffect(() => {
    if (!card) return
    onLiveSummary?.(card.live)
  }, [card, onLiveSummary])

  const selectMatchup = useCallback((index: number) => {
    const matchup = weekSchedule[index]
    if (matchup) setSelectedMatchupId(matchup.id)
  }, [setSelectedMatchupId, weekSchedule])
  const previousMatchup = () => selectMatchup((matchupIndex === 0 ? weekSchedule.length : matchupIndex) - 1)
  const nextMatchup = () => selectMatchup((matchupIndex + 1) % weekSchedule.length)

  const selectHome = useCallback((player: Player) => onSelectPlayer?.(player), [onSelectPlayer])
  const selectAway = useCallback((player: Player) => onSelectPlayer?.({ ...player, ownerName: card?.banner.awayTeam }), [card?.banner.awayTeam, onSelectPlayer])
  const startEdit = useCallback((player: Player) => {
    if (!isUserMatchup) return
    if (onEditSlot) onEditSlot(player)
    else setEditingPlayer(player)
  }, [isUserMatchup, onEditSlot])
  const noopEdit = useCallback(() => undefined, [])

  if (!card) return null

  return (
    <div className="flex min-w-0 flex-col gap-3 pb-16">
      <SwipePager zone="matchup" activeIndex={matchupIndex} itemCount={weekSchedule.length} onIndexChange={selectMatchup} peekPx={14} gapPx={10} className="min-w-0 px-3">
        {cards.map((entry, index) => (
          <div key={entry.id} aria-hidden={index === matchupIndex ? undefined : true} className="h-full">
            <MatchupBanner summary={entry.banner} projectedHome={entry.projectedHome} projectedAway={entry.projectedAway} week={week} homeGamesLeft={entry.homeGamesLeft} awayGamesLeft={entry.awayGamesLeft} active={index === matchupIndex} />
          </div>
        ))}
      </SwipePager>
      <div className="grid grid-cols-2 gap-3 px-3 text-[11px] font-semibold leading-snug text-[#8ba0c7]">
        <p className="min-w-0">{getYetToPlayText(homeRoster)}</p>
        <p className="min-w-0 text-right">{getYetToPlayText(awayRoster)}</p>
      </div>
      <div data-swipe-ignore="true" className="flex touch-pan-x items-center gap-2 overflow-x-auto px-3 pb-1" aria-label="League matchups">
        <button type="button" onClick={previousMatchup} aria-label="Previous matchup" className="shrink-0 text-[#5e7090]"><ChevronLeft className="size-4" /></button>
        {weekSchedule.map((matchup, index) => (
          <button key={matchup.id} type="button" onClick={() => selectMatchup(index)} aria-label={`Matchup ${index + 1}: ${matchup.homeTeam} vs ${matchup.awayTeam}`} className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-black", matchup.id === selectedMatchupId ? "border-[#19ffff] bg-[#19ffff]/10 text-[#19ffff]" : "border-[#172338] bg-[#0d1424] text-[#5e7090]")}>
            <span className="flex size-6 items-center justify-center rounded-full bg-[#172338] text-xs">{matchup.homeTeam.slice(0, 1)}</span>
            <span>vs</span>
            <span className="flex size-6 items-center justify-center rounded-full bg-[#3b1824] text-xs">{matchup.awayTeam.slice(0, 1)}</span>
          </button>
        ))}
        <button type="button" onClick={nextMatchup} aria-label="Next matchup" className="shrink-0 text-[#5e7090]"><ChevronRight className="size-4" /></button>
      </div>
      <section className="overflow-hidden border-y border-[#111929] bg-[#080c14]">
        <div className="flex items-center justify-between border-b border-[#111929] px-3 py-3">
          <h2 className="text-sm font-black text-white">Starters ({rows.filter((row) => !row.home.empty).length}) <ChevronDown className="inline size-3.5 text-[#5e7090]" /></h2>
          <SwipeSurface zone="week" onSwipeLeft={() => onWeekChange(week + 1)} onSwipeRight={() => onWeekChange(Math.max(1, week - 1))} className="flex items-center gap-1 text-xs font-bold text-[#19ffff]">
            <button type="button" onClick={() => onWeekChange(Math.max(1, week - 1))} aria-label="Previous scoring week" className="rounded p-1 hover:bg-[#172338]">
              <ChevronLeft className="size-3.5" />
            </button>
            <span>Week {week}</span>
            <button type="button" onClick={() => onWeekChange(week + 1)} aria-label="Next scoring week" className="rounded p-1 hover:bg-[#172338]">
              <ChevronRight className="size-3.5" />
            </button>
          </SwipeSurface>
        </div>
        <div className="grid grid-cols-2 gap-2 border-b border-[#111929] px-3 py-2 text-xs font-bold text-[#5e7090]"><span className="min-w-0 truncate text-left">{card.banner.homeTeam}</span><span className="min-w-0 truncate text-right">{card.banner.awayTeam}</span></div>
        {rows.map((row, index) => (
          <div key={`${row.slot}-${index}`} className="grid grid-cols-[minmax(0,1fr)_44px_34px_44px_minmax(0,1fr)] items-center border-b border-[#111929] bg-[#0d1424] px-2 py-2 last:border-0 hover:bg-[#101a2e]">
            <div className="min-w-0 text-right">
              <PlayerSide
                player={row.home}
                align="left"
                onSelect={() => row.homeSource && selectHome(row.homeSource)}
                nickname={row.homeSource ? playerNicknames[row.homeSource.id] : undefined}
              />
              {!row.home.empty && <PlayerStats player={row.home} align="left" />}
            </div>
            <Score player={row.home} align="left" week={week} />
            <button
              type="button"
              disabled={row.home.empty || !isUserMatchup}
              onClick={() => row.homeSource && startEdit(row.homeSource)}
              className={cn("flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-xs font-black text-white", slotColors[row.slot], (row.home.empty || !isUserMatchup) && "cursor-default opacity-40")}
            >{row.slot}</button>
            <Score player={row.away} align="right" week={week} />
            <div className="min-w-0 text-left">
              <PlayerSide
                player={row.away}
                align="right"
                onSelect={() => row.awaySource && selectAway(row.awaySource)}
              />
              {!row.away.empty && <PlayerStats player={row.away} align="right" />}
            </div>
          </div>
        ))}
      </section>
      <Reserves homeRoster={homeRoster} awayRoster={awayRoster} teamName={card.banner.homeTeam} opponentName={card.banner.awayTeam} onEdit={isUserMatchup ? startEdit : noopEdit} onSelectHome={selectHome} onSelectAway={selectAway} />

      <LineupSlotDialog player={editingPlayer} roster={roster} capacities={slotCapacities} open={editingPlayer !== null} onOpenChange={(open) => !open && setEditingPlayer(null)} onMove={(playerId, destSlot, targetPlayerId) => { onMove(playerId, destSlot, targetPlayerId); setEditingPlayer(null) }} />
    </div>
  )
})
