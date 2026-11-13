import React from "react"
import { cn } from "@/lib/utils"
import { PlayerPortrait } from "@/components/hockey/player-portrait"
import { TAXI_MAX_NHL_GAMES, getWeekActualPoints, isStarterSlot, type Player } from "@/lib/hockey-data"
import { positionFitsSlot } from "@/lib/roster-eligibility"

export const slotBadgeColors: Record<string, string> = {
  C: "bg-position-c text-white",
  W: "bg-position-w text-white",
  F: "bg-position-f text-white",
  D: "bg-position-d text-position-ink",
  G: "bg-position-g text-position-ink",
  BN: "bg-surface-raised text-text-secondary",
  TAXI: "border border-warning/30 bg-warning-surface text-warning",
  IR: "border border-danger/30 bg-danger-surface text-danger",
}

const playerStatusStyles: Record<string, string> = {
  DTD: "bg-warning-surface text-warning",
  IR: "bg-danger-surface text-danger",
  O: "bg-danger-surface text-danger",
  TAXI: "bg-warning-surface text-warning",
}

function isInvalidRosterPlacement(player: Player): boolean {
  const injured = player.status === "IR" || player.status === "O" || player.status === "DTD"
  if (player.slot === "BN") return false
  if (player.slot === "TAXI") return (player.nhlGamesPlayed ?? 0) >= TAXI_MAX_NHL_GAMES
  if (player.slot === "IR") return player.status !== "IR"
  if (isStarterSlot(player.slot) && !positionFitsSlot(player.slot, player.position)) return true
  return injured
}

export const PlayerItem = React.memo(function PlayerItem({
  player, fallbackSlot, onEdit, onSelect, nickname,
}: {
  player: Player | null
  fallbackSlot: string
  onEdit: (player: Player | null, fallbackSlot: string) => void
  onSelect: (player: Player) => void
  nickname?: string
}) {
  if (!player) {
    return (
      <button type="button" aria-label={`Fill empty ${fallbackSlot} starting slot`} onClick={() => onEdit(null, fallbackSlot)}
        className="flex min-h-14 w-full items-center gap-3 border-b border-border px-4 py-2 text-left text-text-muted transition-colors hover:bg-surface-hover">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold", slotBadgeColors[fallbackSlot])}>{fallbackSlot}</span>
        <span className="flex-1 text-sm font-semibold">Empty starting slot</span>
        <span aria-hidden="true" className="text-xs font-bold">Add player</span>
      </button>
    )
  }

  const projected = player.schedule?.weekProjectedFantasyPoints
  const actual = getWeekActualPoints(player)
  const invalid = isInvalidRosterPlacement(player)
  return (
    <div data-testid="team-player-row" className={cn(
      "flex min-w-0 items-center gap-2 border-b border-border px-3 py-2 transition-colors",
      invalid ? "bg-danger-surface/30" : "bg-surface hover:bg-surface-hover",
    )}>
      <button type="button" onClick={() => onEdit(player, fallbackSlot)}
        aria-label={`Edit ${player.name} ${player.slot} roster slot`}
        className={cn("flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-1 text-xs font-extrabold focus-visible:outline-2 focus-visible:outline-ring", slotBadgeColors[player.slot] || slotBadgeColors[player.position])}>
        {player.slot}
      </button>

      <button type="button" onClick={() => onSelect(player)}
        aria-label={`View ${player.name} player details`}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
        <PlayerPortrait player={player} name={player.name} className="size-9" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1">
            <span title={player.name} className="min-w-0 truncate text-sm font-bold leading-tight text-foreground">{player.name}</span>
            {player.status && <span className={cn("shrink-0 rounded px-1 py-0.5 text-[10px] font-bold", playerStatusStyles[player.status] ?? "bg-surface-raised text-text-secondary")}>{player.status}</span>}
          </span>
          {nickname && <span className="block truncate text-[11px] italic text-text-muted">{nickname}</span>}
          <span className="block truncate text-xs leading-snug text-text-secondary">
            <b className="font-semibold">{player.position}</b> · {player.team} · {player.schedule
              ? (player.schedule.opponent && player.schedule.opponent !== "—"
                ? `${player.schedule.day} ${player.schedule.time} ${player.schedule.opponent}`
                : `${player.schedule.day} ${player.schedule.time}`)
              : "No game this week"}
          </span>
          <span className="block text-[11px] font-medium text-text-muted">{player.schedule?.weekGamesScheduled ?? 0} GP scheduled</span>
        </span>
      </button>

      <button type="button" onClick={() => onSelect(player)}
        aria-label={`${player.name}: ${actual.toFixed(1)} actual FPTS, ${projected?.toFixed(1) ?? "unavailable"} projected FPTS; view details`}
        className="flex min-h-11 min-w-12 shrink-0 flex-col items-end justify-center text-right focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
        <span className="ui-stat-number text-sm font-extrabold leading-none text-foreground">{actual.toFixed(1)}</span>
        <span className="ui-stat-number mt-1 text-[11px] font-semibold leading-none text-text-muted">proj {projected?.toFixed(1) ?? "—"}</span>
      </button>
    </div>
  )
})
