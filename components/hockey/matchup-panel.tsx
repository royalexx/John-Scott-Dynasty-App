"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getTeamRoster,
  getWeekMatchups,
  weekMatchups,
  type MatchupSummary,
  type LiveMatchupSummary,
  type MatchupPlayer,
  type Player,
  type MarketPlayer,
} from "@/lib/hockey-data"
import { LineupSlotDialog } from "@/components/hockey/lineup-slot-dialog"
import { MatchupBanner } from "@/components/hockey/matchup-banner"
import { PlayerRow } from "@/components/hockey/player-row"

type StartingSlot = Extract<Player["slot"], "C" | "W" | "F" | "D" | "G">
type ReserveSlot = "BN" | "TAXI" | "IR"
const slotCapacities: Record<StartingSlot, number> = { C: 3, W: 6, F: 3, D: 6, G: 2 }
const slotGroups: StartingSlot[] = ["C", "W", "F", "D", "G"]
const slotColors: Record<StartingSlot, string> = {
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

const opponentReserves: Record<string, Record<ReserveSlot, MatchupPlayer[]>> = {
  m1: {
    BN: [
      { name: "John Tavares", position: "C", team: "TOR", opponent: "@ OTT", status: null, todayPts: null, projPts: 13.4 },
      { name: "William Nylander", position: "RW", team: "TOR", opponent: "@ OTT", status: null, todayPts: null, projPts: 17.3 },
    ],
    TAXI: [{ name: "Easton Cowan", position: "RW", team: "TOR", opponent: "@ OTT", status: "TAXI", todayPts: null, projPts: 9.8 }],
    IR: [],
  },
  m2: { BN: [], TAXI: [], IR: [] },
  m3: { BN: [], TAXI: [], IR: [] },
}

export function getYetToPlayText(teamRoster: Player[]): string {
    const counts: Record<"C" | "W" | "F" | "D" | "G", number> = { C: 0, W: 0, F: 0, D: 0, G: 0 }
    teamRoster
      .filter((player) => ["C", "W", "F", "D", "G"].includes(player.slot))
      .filter((player) => player.gameState !== "Final" && player.status !== "O" && player.status !== "IR")
      .forEach((player) => {
        const group = player.slot
        if (group in counts) counts[group as keyof typeof counts] += 1
      })
    const parts = (Object.keys(counts) as Array<keyof typeof counts>)
      .filter((slot) => counts[slot] > 0)
      .map((slot) => `${counts[slot]} ${slot}`)
    return `yet to play: ${parts.length ? parts.join(", ") : "none"}`
  }

function emptyPlayer(slot: StartingSlot): MatchupPlayer {
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

function PlayerSide({
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
}

function Score({ player, align }: { player: MatchupPlayer; align: "left" | "right" }) {
  const displayedPoints = player.schedule && player.schedule.weekGamesPlayed > 0
    ? player.schedule.weekFantasyPoints
    : player.schedule?.weekProjectedFantasyPoints
  return (
    <div className={cn("w-full shrink-0", align === "left" ? "pr-2 text-right" : "pl-2 text-left")}>
      <p className="text-sm font-bold tabular-nums text-white">{displayedPoints != null ? displayedPoints.toFixed(1) : "—"}</p>
      <p className="text-[10px] tabular-nums text-[#5e7090]">{player.schedule ? player.schedule.weekProjectedFantasyPoints.toFixed(1) : "—"}</p>
    </div>
  )
}

function PlayerStats({ player, align }: { player: MatchupPlayer; align: "left" | "right" }) {
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
  const displayStats = stats || "No game stats"
  return (
    <p className={cn("truncate text-[9px] text-[#5e7090]", align === "left" ? "text-right" : "text-left")}>
      {displayStats}
    </p>
  )
}

function WinBar({ homePct }: { homePct: number }) {
  const awayPct = 100 - homePct
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] font-black tabular-nums">
        <span className="text-[#19ffff]">{homePct}% WIN</span>
        <span className="text-[#ff2a85]">{awayPct}% WIN</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-[#172338]">
        <div className="bg-[#19ffff]" style={{ width: `${homePct}%` }} />
        <div className="bg-[#ff2a85]" style={{ width: `${awayPct}%` }} />
      </div>
    </div>
  )
}

function TeamAvatar({ team, magenta = false }: { team: string; magenta?: boolean }) {
  return <div className={cn("flex size-9 items-center justify-center rounded-full border text-[10px] font-black", magenta ? "border-[#ff2a85]/40 bg-[#ff2a85]/10 text-[#ff2a85]" : "border-[#19ffff]/40 bg-[#19ffff]/10 text-[#19ffff]")}><Shield className="mr-0.5 size-3.5" />{team.slice(0, 3).toUpperCase()}</div>
}

function MatchupCard({ summary, onClick }: { summary: (typeof weekMatchups)[number]; onClick: () => void }) {
  const projectedHome = summary.homeScore + 12
  const projectedAway = summary.awayScore + 8
  const homePct = Math.round((projectedHome / (projectedHome + projectedAway)) * 100)
  return (
    <button type="button" onClick={onClick} className="w-full rounded-xl border border-[#172338] bg-[#0d1424] p-3.5 text-left transition-colors hover:bg-[#101a2e]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><TeamAvatar team={summary.homeTeam} /><span className="truncate text-xs font-bold text-white">{summary.homeTeam}</span></div>
          <p className="mt-1 pl-11 text-[10px] text-[#5e7090]">{summary.homeOwner} · {summary.homeRecord}</p>
        </div>
        <span className="rounded bg-[#172338] px-2 py-1 text-[10px] font-black text-[#5e7090]">VS</span>
        <div className="min-w-0 flex-1 text-right">
          <div className="flex items-center justify-end gap-2"><span className="truncate text-xs font-bold text-white">{summary.awayTeam}</span><TeamAvatar team={summary.awayTeam} magenta /></div>
          <p className="mt-1 pr-11 text-[10px] text-[#5e7090]">{summary.awayRecord} · {summary.awayOwner}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div><p className="text-2xl font-black tabular-nums text-white">{summary.homeScore.toFixed(2)}</p><p className="text-[10px] text-[#5e7090]">proj {projectedHome.toFixed(2)}</p></div>
        <div className="text-right"><p className="text-2xl font-black tabular-nums text-white">{summary.awayScore.toFixed(2)}</p><p className="text-[10px] text-[#5e7090]">proj {projectedAway.toFixed(2)}</p></div>
      </div>
      <div className="mt-3"><WinBar homePct={homePct} /></div>
    </button>
  )
}

function Reserves({
  roster,
  players,
  opponent,
  teamName,
  opponentName,
  onEdit,
}: {
  roster: Player[]
  players?: MarketPlayer[]
  opponent: Record<ReserveSlot, MatchupPlayer[]>
  teamName: string
  opponentName: string
  onEdit: (player: Player) => void
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
            const home = roster.filter((player) => player.slot === slot)
            const away = opponent[slot] ?? []
            return (
              <div key={slot} className="grid grid-cols-2 border-b border-[#111929] last:border-0">
                <div className="border-r border-[#111929]">
                  <p className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#5e7090]">{label}</p>
                  {home.length ? home.map((player) => <PlayerRow key={player.id} player={player} onEditSlot={() => onEdit(player)} />) : <p className="px-3 pb-3 text-xs text-[#5e7090]">Empty</p>}
                </div>
                <div>
                  <p className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-[#5e7090]">{label}</p>
                  {away.length ? away.map((player) => <PlayerRow key={`${slot}-${player.name}`} player={{ ...player, id: `${slot}-${player.name}`, slot, gameTime: "Tonight" }} />) : <p className="px-3 pb-3 text-right text-xs text-[#5e7090]">Empty</p>}
                </div>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}

export function MatchupPanel({
  roster,
  players,
  teamName,
  playerNicknames,
  onMove,
  onSelectPlayer,
  onEditSlot,
  week,
  onWeekChange,
  selectedMatchupId: controlledMatchupId,
  onMatchupChange,
  onLiveSummary,
}: {
  roster: Player[]
  players?: MarketPlayer[]
  teamName: string
  playerNicknames: Record<string, string>
  onMove: (playerId: string, destSlot: Player["slot"]) => void
  onSelectPlayer?: (player: Player) => void
  onEditSlot?: (player: Player) => void
  week: number
  onWeekChange: (week: number) => void
  selectedMatchupId?: string
  onMatchupChange?: (matchupId: string) => void
  onLiveSummary?: (summary: LiveMatchupSummary) => void
}) {
  const weekSchedule = getWeekMatchups(week)
  const userMatchup = weekSchedule.find((matchup) => matchup.homeOwner === "You" || matchup.homeTeam === "Montreal Monarchs") ?? weekSchedule[0]
  const [localMatchupId, setLocalMatchupId] = useState(userMatchup.id)
  const selectedMatchupId = controlledMatchupId ?? localMatchupId
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [liveRosters, setLiveRosters] = useState<{ home: Player[]; away: Player[] }>({ home: [], away: [] })
  const setSelectedMatchupId = (id: string) => {
    if (controlledMatchupId === undefined) setLocalMatchupId(id)
    onMatchupChange?.(id)
  }
  useEffect(() => {
    const matchupForWeek = userMatchup
    if (matchupForWeek && matchupForWeek.id !== selectedMatchupId) {
      setSelectedMatchupId(matchupForWeek.id)
    }
  }, [week])
  useEffect(() => {
    if (controlledMatchupId && !weekSchedule.some((matchup) => matchup.id === controlledMatchupId)) {
      setLocalMatchupId(userMatchup.id)
      onMatchupChange?.(userMatchup.id)
    }
  }, [controlledMatchupId])
  const matchupIndex = Math.max(0, weekSchedule.findIndex((matchup) => matchup.id === selectedMatchupId))
  const summary = weekSchedule[matchupIndex] ?? userMatchup
  const isUserMatchup = summary.homeOwner === "You" || summary.homeTeam === "Montreal Monarchs"
  const displaySummary = isUserMatchup ? { ...summary, homeTeam: teamName } : summary
  const sourceHomeRoster = getTeamRoster(summary.homeTeam, roster, players)
  const sourceAwayRoster = getTeamRoster(summary.awayTeam, roster, players)
  useEffect(() => {
    setLiveRosters({
      home: sourceHomeRoster.map((player) => ({ ...player, gameState: player.gameState ?? "In Progress", timeRemaining: player.timeRemaining ?? 40 })),
      away: sourceAwayRoster.map((player) => ({ ...player, gameState: player.gameState ?? "In Progress", timeRemaining: player.timeRemaining ?? 40 })),
    })
  }, [selectedMatchupId, roster, players])
  const homeRoster = liveRosters.home.length ? liveRosters.home : sourceHomeRoster
  const awayRoster = liveRosters.away.length ? liveRosters.away : sourceAwayRoster
  const rows = slotGroups.flatMap((slot) => {
    const homePlayers = homeRoster.filter((player) => player.slot === slot)
    const awayPlayers = awayRoster.filter((player) => player.slot === slot)
    return Array.from({ length: slotCapacities[slot] }, (_, index) => {
      return {
        slot,
        home: homePlayers[index] ? { ...homePlayers[index] } satisfies MatchupPlayer : emptyPlayer(slot),
        away: awayPlayers[index] ? { ...awayPlayers[index] } satisfies MatchupPlayer : emptyPlayer(slot),
      }
    })
  })
  const expectedTotal = (players: Player[]) => players
    .filter((player) => ["C", "W", "F", "D", "G"].includes(player.slot))
    .reduce((sum, player) => sum + (player.schedule?.weekProjectedFantasyPoints ?? player.projPts), 0)
  const projectedHome = expectedTotal(homeRoster)
  const projectedAway = expectedTotal(awayRoster)
  const isStarter = (player: Player) => ["C", "W", "F", "D", "G"].includes(player.slot)
  const homeGamesLeft = homeRoster.filter((player) => isStarter(player) && player.gameState !== "Final").length
  const awayGamesLeft = awayRoster.filter((player) => isStarter(player) && player.gameState !== "Final").length
  const liveSummary = {
    ...summary,
    homeTeam: displaySummary.homeTeam,
    homeScore: rows.reduce((sum, row) => sum + (row.home.schedule && row.home.schedule.weekGamesPlayed > 0 ? row.home.schedule.weekFantasyPoints : row.home.schedule?.weekProjectedFantasyPoints ?? row.home.todayPts ?? 0), 0),
    awayScore: rows.reduce((sum, row) => sum + (row.away.schedule && row.away.schedule.weekGamesPlayed > 0 ? row.away.schedule.weekFantasyPoints : row.away.schedule?.weekProjectedFantasyPoints ?? row.away.todayPts ?? 0), 0),
  }
  useEffect(() => {
    onLiveSummary?.({ ...liveSummary, projectedHome, projectedAway })
  }, [liveSummary.id, liveSummary.homeScore, liveSummary.awayScore, projectedHome, projectedAway, onLiveSummary])
  const selectMatchup = (index: number) => setSelectedMatchupId(weekSchedule[index].id)
  const previousMatchup = () => selectMatchup((matchupIndex === 0 ? weekSchedule.length : matchupIndex) - 1)
  const nextMatchup = () => selectMatchup((matchupIndex + 1) % weekSchedule.length)

  return (
    <div className="flex flex-col gap-3 pb-4">
      <MatchupBanner summary={{ ...liveSummary, homeTeam: displaySummary.homeTeam }} projectedHome={projectedHome} projectedAway={projectedAway} week={week} homeGamesLeft={homeGamesLeft} awayGamesLeft={awayGamesLeft} />
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
            <div className="grid grid-cols-2 gap-2 border-b border-[#111929] px-3 py-2 text-[10px] font-bold text-[#5e7090]"><span className="min-w-0 truncate text-left">{displaySummary.homeTeam}</span><span className="min-w-0 truncate text-right">{displaySummary.awayTeam}</span></div>
            {rows.map((row, index) => (
              <div key={`${row.slot}-${index}`} className="grid grid-cols-[minmax(0,1fr)_44px_34px_44px_minmax(0,1fr)] items-center border-b border-[#111929] bg-[#0d1424] px-2 py-2 last:border-0 hover:bg-[#101a2e]">
                <div className="min-w-0 text-right">
                  <PlayerSide player={row.home} align="left" onSelect={(player) => {
                    const selected = homeRoster.find((candidate) => candidate.name === player.name)
                    if (selected && onSelectPlayer) onSelectPlayer(selected)
                    else onSelectPlayer?.(player as Player)
                  }} nickname={homeRoster.find((candidate) => candidate.name === row.home.name)?.id ? playerNicknames[homeRoster.find((candidate) => candidate.name === row.home.name)?.id ?? ""] : undefined} />
                  {!row.home.empty && <PlayerStats player={row.home} align="left" />}
                </div>
                <Score player={row.home} align="left" />
                <button type="button" disabled={row.home.empty || !isUserMatchup} onClick={() => {
                  const player = homeRoster.find((candidate) => candidate.name === row.home.name)
                  if (!player) return
                  if (!isUserMatchup) return
                  if (onEditSlot) onEditSlot(player)
                  else setEditingPlayer(player)
                }} className={cn("flex size-7 items-center justify-center rounded-md text-[10px] font-black text-white", slotColors[row.slot], (row.home.empty || !isUserMatchup) && "cursor-default opacity-40")}>{row.slot}</button>
                <Score player={row.away} align="right" />
                <div className="min-w-0 text-left">
                  <PlayerSide player={row.away} align="right" onSelect={(player) => onSelectPlayer?.(player as Player)} />
                  {!row.away.empty && <PlayerStats player={row.away} align="right" />}
                </div>
              </div>
            ))}
          </section>
          <Reserves roster={homeRoster} opponent={opponentReserves[summary.id] ?? { BN: [], TAXI: [], IR: [] }} teamName={displaySummary.homeTeam} opponentName={displaySummary.awayTeam} onEdit={isUserMatchup ? setEditingPlayer : () => undefined} />

      <LineupSlotDialog player={editingPlayer} roster={roster} open={editingPlayer !== null} onOpenChange={(open) => !open && setEditingPlayer(null)} onMove={(playerId, destSlot) => { onMove(playerId, destSlot); setEditingPlayer(null) }} />
    </div>
  )
}
