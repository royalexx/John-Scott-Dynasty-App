"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
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
  type Player,
  type StarterSlot,
} from "@/lib/hockey-data"
import type { MatchupResult } from "@/lib/dashboard-data"
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
        {align === "left" && player.status && <span className={cn("rounded px-1 py-0.5 text-[9px] font-black", statusStyles[player.status])}>{player.status}</span>}
        <span className="truncate text-xs font-bold text-white">{player.name}</span>
        {align === "right" && player.status && <span className={cn("rounded px-1 py-0.5 text-[9px] font-black", statusStyles[player.status])}>{player.status}</span>}
      </div>
      {nickname && <p className="truncate text-[10px] italic text-[#5e7090]">{nickname}</p>}
      <p className="truncate text-[10px] text-[#5e7090]">
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
      <p className="text-[10px] leading-tight text-[#5e7090]">
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
    <p className={cn("truncate text-[9px] text-[#5e7090]", align === "left" ? "text-right" : "text-left")}>
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
        <span><b className="block text-sm text-white">Bench & Reserves</b><small className="text-[10px] text-[#5e7090]">BN · TAXI · IR</small></span>
        <ChevronDown className={cn("size-5 text-[#5e7090] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="grid grid-cols-2 border-b border-[#111929] px-3 py-2 text-[10px] font-bold text-[#5e7090]"><span>{teamName}</span><span className="text-right">{opponentName}</span></div>
          {groups.map(({ slot, label }) => {
            const home = homeRoster.filter((player) => player.slot === slot)
            const away = awayRoster.filter((player) => player.slot === slot)
            return (
              <div key={slot} className="grid grid-cols-2 border-b border-[#111929] last:border-0">
                <div className="border-r border-[#111929]">
                  <p className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#5e7090]">{label}</p>
                  {home.length ? home.map((player) => <PlayerRow key={player.id} player={player} onSelect={onSelectHome} onEditSlot={() => onEdit(player)} />) : <p className="px-3 pb-3 text-xs text-[#5e7090]">Empty</p>}
                </div>
                <div>
                  <p className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-[#5e7090]">{label}</p>
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
}: {
  roster: Player[]
  players?: MarketPlayer[]
  teamName: string
  playerNicknames: Record<string, string>
  slotCapacities?: Record<StarterSlot, number>
  onMove: (playerId: string, destSlot: Player["slot"]) => void
  onSelectPlayer?: (player: LineupPlayerSelection) => void
  onEditSlot?: (player: Player) => void
  week: number
  onWeekChange: (week: number) => void
  selectedMatchupId?: string
  onMatchupChange?: (matchupId: string) => void
  onLiveSummary?: (summary: LiveMatchupSummary) => void
  matchupResults?: MatchupResult[]
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
  const summary = weekSchedule[matchupIndex] ?? userMatchup
  const isUserMatchup = summary.homeTeam === teamName || summary.awayTeam === teamName
  // The user's own team is always shown on the left, even when scheduled as the away team.
  const flip = summary.awayTeam === teamName
  const trueHomeRoster = useMemo(() => getTeamRoster(summary.homeTeam, roster, players), [summary.homeTeam, roster, players])
  const trueAwayRoster = useMemo(() => getTeamRoster(summary.awayTeam, roster, players), [summary.awayTeam, roster, players])
  const homeRoster = flip ? trueAwayRoster : trueHomeRoster
  const awayRoster = flip ? trueHomeRoster : trueAwayRoster
  const display = useMemo(() => flip
    ? { ...summary, homeTeam: summary.awayTeam, homeOwner: summary.awayOwner, homeRecord: summary.awayRecord, homeScore: summary.awayScore, awayTeam: summary.homeTeam, awayOwner: summary.homeOwner, awayRecord: summary.homeRecord, awayScore: summary.homeScore }
    : summary, [flip, summary])

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
  }), [homeRoster, awayRoster, slotCapacities])

  const finalResult = matchupResults.find((result) => result.week === week && result.isFinal && result.homeTeam === summary.homeTeam && result.awayTeam === summary.awayTeam)
  const totals = useMemo(() => {
    const starters = (list: Player[]) => list.filter((player) => isStarterSlot(player.slot))
    const expected = (list: Player[]) => starters(list).reduce((sum, player) => sum + (getWeekProjectedPoints(player, week) ?? 0), 0)
    const actual = (list: Player[]) => starters(list).reduce((sum, player) => sum + getWeekActualPoints(player, week), 0)
    const gamesLeft = (list: Player[]) => starters(list).filter((player) => player.gameState !== "Final").length
    return {
      projectedHome: expected(trueHomeRoster),
      projectedAway: expected(trueAwayRoster),
      homeScore: finalResult ? finalResult.homeScore : actual(trueHomeRoster),
      awayScore: finalResult ? finalResult.awayScore : actual(trueAwayRoster),
      homeGamesLeft: gamesLeft(trueHomeRoster),
      awayGamesLeft: gamesLeft(trueAwayRoster),
    }
  }, [trueHomeRoster, trueAwayRoster, week, finalResult])

  // True home/away orientation, consumed by the league feed.
  const liveSummary = useMemo(() => ({ ...summary, homeScore: totals.homeScore, awayScore: totals.awayScore, ...(finalResult ? { status: "Final" } : {}) }), [summary, totals.homeScore, totals.awayScore, finalResult])
  // Left/right orientation (user's team on the left), consumed by the banner.
  const bannerSummary = useMemo(() => ({ ...display, homeScore: flip ? totals.awayScore : totals.homeScore, awayScore: flip ? totals.homeScore : totals.awayScore, ...(finalResult ? { status: "Final" } : {}) }), [display, flip, totals.homeScore, totals.awayScore, finalResult])

  useEffect(() => {
    onLiveSummary?.({ ...liveSummary, projectedHome: totals.projectedHome, projectedAway: totals.projectedAway })
  }, [liveSummary, totals.projectedHome, totals.projectedAway, onLiveSummary])

  const selectMatchup = (index: number) => setSelectedMatchupId(weekSchedule[index].id)
  const previousMatchup = () => selectMatchup((matchupIndex === 0 ? weekSchedule.length : matchupIndex) - 1)
  const nextMatchup = () => selectMatchup((matchupIndex + 1) % weekSchedule.length)

  const selectHome = useCallback((player: Player) => onSelectPlayer?.(player), [onSelectPlayer])
  const selectAway = useCallback((player: Player) => onSelectPlayer?.({ ...player, ownerName: display.awayTeam }), [onSelectPlayer, display.awayTeam])
  const startEdit = useCallback((player: Player) => {
    if (!isUserMatchup) return
    if (onEditSlot) onEditSlot(player)
    else setEditingPlayer(player)
  }, [isUserMatchup, onEditSlot])
  const noopEdit = useCallback(() => undefined, [])

  return (
    <div className="flex flex-col gap-3 pb-16">
      <MatchupBanner summary={bannerSummary} projectedHome={flip ? totals.projectedAway : totals.projectedHome} projectedAway={flip ? totals.projectedHome : totals.projectedAway} week={week} homeGamesLeft={flip ? totals.awayGamesLeft : totals.homeGamesLeft} awayGamesLeft={flip ? totals.homeGamesLeft : totals.awayGamesLeft} />
      <div className="flex items-center gap-2 overflow-x-auto px-3 pb-1" aria-label="League matchups">
        <button type="button" onClick={previousMatchup} aria-label="Previous matchup" className="shrink-0 text-[#5e7090]"><ChevronLeft className="size-4" /></button>
        {weekSchedule.map((matchup, index) => (
          <button key={matchup.id} type="button" onClick={() => selectMatchup(index)} aria-label={`Matchup ${index + 1}: ${matchup.homeTeam} vs ${matchup.awayTeam}`} className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black", matchup.id === selectedMatchupId ? "border-[#19ffff] bg-[#19ffff]/10 text-[#19ffff]" : "border-[#172338] bg-[#0d1424] text-[#5e7090]")}>
            <span className="flex size-4 items-center justify-center rounded-full bg-[#172338] text-[8px]">{matchup.homeTeam.slice(0, 1)}</span>
            <span>vs</span>
            <span className="flex size-4 items-center justify-center rounded-full bg-[#3b1824] text-[8px]">{matchup.awayTeam.slice(0, 1)}</span>
          </button>
        ))}
        <button type="button" onClick={nextMatchup} aria-label="Next matchup" className="shrink-0 text-[#5e7090]"><ChevronRight className="size-4" /></button>
      </div>
      <section className="overflow-hidden border-y border-[#111929] bg-[#080c14]">
        <div className="flex items-center justify-between border-b border-[#111929] px-3 py-3">
          <h2 className="text-sm font-black text-white">Starters ({rows.filter((row) => !row.home.empty).length}) <ChevronDown className="inline size-3.5 text-[#5e7090]" /></h2>
          <div className="flex items-center gap-1 text-xs font-bold text-[#19ffff]">
            <button type="button" onClick={() => onWeekChange(Math.max(1, week - 1))} aria-label="Previous scoring week" className="rounded p-1 hover:bg-[#172338]">
              <ChevronLeft className="size-3.5" />
            </button>
            <span>Week {week}</span>
            <button type="button" onClick={() => onWeekChange(week + 1)} aria-label="Next scoring week" className="rounded p-1 hover:bg-[#172338]">
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-b border-[#111929] px-3 py-2 text-[10px] font-bold text-[#5e7090]"><span className="min-w-0 truncate text-left">{display.homeTeam}</span><span className="min-w-0 truncate text-right">{display.awayTeam}</span></div>
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
              className={cn("flex size-7 items-center justify-center rounded-md text-[10px] font-black text-white", slotColors[row.slot], (row.home.empty || !isUserMatchup) && "cursor-default opacity-40")}
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
      <Reserves homeRoster={homeRoster} awayRoster={awayRoster} teamName={display.homeTeam} opponentName={display.awayTeam} onEdit={isUserMatchup ? startEdit : noopEdit} onSelectHome={selectHome} onSelectAway={selectAway} />

      <LineupSlotDialog player={editingPlayer} roster={roster} capacities={slotCapacities} open={editingPlayer !== null} onOpenChange={(open) => !open && setEditingPlayer(null)} onMove={(playerId, destSlot) => { onMove(playerId, destSlot); setEditingPlayer(null) }} />
    </div>
  )
})
