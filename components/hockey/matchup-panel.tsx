"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  applyWeekLineup,
  weekAssignmentsReplaceLiveRoster,
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
import { PlayerPortrait } from "@/components/hockey/player-portrait"

type ReserveSlot = "BN" | "TAXI" | "IR"
/** A selected lineup player; `ownerName` is set when the player belongs to the opposing team. */
export type LineupPlayerSelection = Player & { ownerName?: string }

const slotColors: Record<StarterSlot, string> = {
  C: "bg-position-c text-white",
  W: "bg-position-w text-white",
  F: "bg-position-f text-white",
  D: "bg-position-d text-position-ink",
  G: "bg-position-g text-position-ink",
}
const statusStyles: Record<string, string> = {
  IR: "bg-danger-surface text-danger",
  TAXI: "bg-warning-surface text-warning",
  O: "bg-danger-surface text-danger",
  DTD: "bg-warning-surface text-warning",
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

type WeekLineup = { source?: "snapshot" | "live"; currentWeek?: number; frozen?: boolean; assignments: Array<{ teamName: string; nhlId: number; slot: string }> } | null

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
  const useAssignments = weekAssignmentsReplaceLiveRoster(week, weekLineup)
  const trueHomeRoster = applyWeekLineup(summary.homeTeam, getTeamRoster(summary.homeTeam, roster, market), market, assignments, useAssignments)
  const trueAwayRoster = applyWeekLineup(summary.awayTeam, getTeamRoster(summary.awayTeam, roster, market), market, assignments, useAssignments)
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
    return <div className={cn("min-w-0 text-xs text-text-muted", align === "left" ? "text-right" : "text-left")}>Empty slot</div>
  }
  return (
    <button
      type="button"
      data-testid={align === "right" ? "away-player" : "home-player"}
      onClick={() => onSelect(player)}
      className={cn("flex min-h-11 w-full min-w-0 items-center gap-1 rounded-lg px-0.5 py-1 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring", align === "left" ? "flex-row-reverse text-right" : "text-left")}
    >
      <PlayerPortrait player={player} name={player.name} className="size-7" />
      <span className="min-w-0 flex-1">
        <span className={cn("flex min-w-0 items-center gap-1", align === "left" && "justify-end")}>
          <span className="min-w-0 truncate text-xs font-bold text-foreground" title={player.name}>{player.name}</span>
          {player.status && <span className={cn("shrink-0 rounded px-1 text-[10px] font-bold", statusStyles[player.status])}>{player.status}</span>}
        </span>
        {nickname && <span className="block truncate text-[11px] italic text-text-muted">{nickname}</span>}
        <span className="block truncate text-[11px] text-text-secondary">
          {player.schedule
            ? `${player.team} · ${player.schedule.opponent} · ${player.schedule.day} ${player.schedule.time}`
            : "No game this week"}
        </span>
      </span>
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
    <div className={cn("w-full shrink-0", align === "left" ? "pr-1 text-right" : "pl-1 text-left")}>
      <p className="ui-stat-number text-sm font-extrabold text-foreground">{player.empty ? "—" : getActualPoints(player, week)}</p>
      <p className="text-[11px] leading-tight text-text-muted">
        <span className="block uppercase tracking-wide">proj</span>
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
    <p className={cn("truncate text-xs text-text-muted", align === "left" ? "text-right" : "text-left")}>
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
    <section data-testid="match-reserves" className="mx-3 overflow-hidden rounded-2xl border border-border bg-surface">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-14 w-full items-center justify-between border-b border-border px-4 py-3 text-left hover:bg-surface-hover">
        <span><b className="block text-sm text-foreground">Bench & Reserves</b><small className="text-xs text-text-muted">BN · TAXI · IR</small></span>
        <ChevronDown className={cn("size-5 text-text-secondary transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="grid grid-cols-2 border-b border-border px-3 py-2 text-xs font-bold text-text-secondary"><span>{teamName}</span><span className="text-right">{opponentName}</span></div>
          {groups.map(({ slot, label }) => {
            const home = homeRoster.filter((player) => player.slot === slot)
            const away = awayRoster.filter((player) => player.slot === slot)
            return (
              <div key={slot} className="grid grid-cols-2 border-b border-border last:border-0">
                <div className="border-r border-border">
                  <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-muted">{label}</p>
                  {home.length ? home.map((player) => <PlayerRow key={player.id} player={player} onSelect={onSelectHome} onEditSlot={() => onEdit(player)} />) : <p className="px-3 pb-3 text-xs text-text-muted">Empty</p>}
                </div>
                <div>
                  <p className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-text-muted">{label}</p>
                  {away.length ? away.map((player) => <PlayerRow key={player.id} player={player} onSelect={onSelectAway} />) : <p className="px-3 pb-3 text-right text-xs text-text-muted">Empty</p>}
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
  weekLineup?: WeekLineup
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
    <div data-testid="match-content" className="flex min-w-0 flex-col gap-4 pb-4 pt-3">
      <SwipePager zone="matchup" activeIndex={matchupIndex} itemCount={weekSchedule.length} onIndexChange={selectMatchup} peekPx={14} gapPx={10} className="min-w-0 pl-3 pr-3">
        {cards.map((entry, index) => (
          <div key={entry.id} aria-hidden={index === matchupIndex ? undefined : true} className="h-full">
            <MatchupBanner summary={entry.banner} projectedHome={entry.projectedHome} projectedAway={entry.projectedAway} week={week} homeGamesLeft={entry.homeGamesLeft} awayGamesLeft={entry.awayGamesLeft} active={index === matchupIndex} />
          </div>
        ))}
      </SwipePager>
      <div className="grid grid-cols-2 gap-3 px-4 text-xs font-medium leading-snug text-text-secondary">
        <p className="min-w-0">{getYetToPlayText(homeRoster)}</p>
        <p className="min-w-0 text-right">{getYetToPlayText(awayRoster)}</p>
      </div>
      <div data-swipe-ignore="true" className="flex touch-pan-x items-center gap-2 overflow-x-auto px-3 pb-1" aria-label="League matchups">
        <button type="button" onClick={previousMatchup} aria-label="Previous matchup" className="ui-touch-target flex shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-hover"><ChevronLeft className="size-4" /></button>
        {weekSchedule.map((matchup, index) => (
          <button key={matchup.id} type="button" onClick={() => selectMatchup(index)} aria-label={`Matchup ${index + 1}: ${matchup.homeTeam} vs ${matchup.awayTeam}`} className={cn("flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold", matchup.id === selectedMatchupId ? "border-brand bg-brand/10 text-brand" : "border-border bg-surface text-text-secondary hover:bg-surface-hover")}>
            <span className="flex size-6 items-center justify-center rounded-full bg-surface-raised text-xs">{matchup.homeTeam.slice(0, 1)}</span>
            <span>vs</span>
            <span className="flex size-6 items-center justify-center rounded-full bg-surface-raised text-xs">{matchup.awayTeam.slice(0, 1)}</span>
          </button>
        ))}
        <button type="button" onClick={nextMatchup} aria-label="Next matchup" className="ui-touch-target flex shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-hover"><ChevronRight className="size-4" /></button>
      </div>
      <section data-testid="match-starters" className="mx-3 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
          <h2 className="text-base font-bold text-foreground">Starting lineups <span className="text-xs font-semibold text-text-muted">({rows.filter((row) => !row.home.empty).length})</span></h2>
          <SwipeSurface zone="week" onSwipeLeft={() => onWeekChange(week + 1)} onSwipeRight={() => onWeekChange(Math.max(1, week - 1))} className="flex items-center gap-1 rounded-xl border border-border bg-background text-xs font-bold text-brand">
            <button type="button" onClick={() => onWeekChange(Math.max(1, week - 1))} aria-label="Previous scoring week" className="ui-touch-target flex items-center justify-center rounded-lg hover:bg-surface-hover">
              <ChevronLeft className="size-3.5" />
            </button>
            <span>Week {week}</span>
            <button type="button" onClick={() => onWeekChange(week + 1)} aria-label="Next scoring week" className="ui-touch-target flex items-center justify-center rounded-lg hover:bg-surface-hover">
              <ChevronRight className="size-3.5" />
            </button>
          </SwipeSurface>
        </div>
        <div className="grid grid-cols-2 gap-2 border-b border-border bg-background px-3 py-2 text-xs font-bold text-text-secondary"><span className="min-w-0 truncate text-left">{card.banner.homeTeam}</span><span className="min-w-0 truncate text-right">{card.banner.awayTeam}</span></div>
        {rows.map((row, index) => (
          <div key={`${row.slot}-${index}`} className="grid grid-cols-[minmax(0,1fr)_44px_44px_44px_minmax(0,1fr)] items-center border-b border-border bg-surface px-2 py-2 last:border-0 hover:bg-surface-hover">
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
              aria-label={`Edit ${row.slot} starting slot`}
              className={cn("flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1 text-xs font-extrabold", slotColors[row.slot], (row.home.empty || !isUserMatchup) && "cursor-default opacity-45")}
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
