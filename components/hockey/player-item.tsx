import React from "react"
import { cn } from "@/lib/utils"
import { PlayerPortrait } from "@/components/hockey/player-portrait"
import { TAXI_MAX_NHL_GAMES, getWeekActualPoints, type Player } from "@/lib/hockey-data"

export const slotBadgeColors: Record<string, string> = {
  C: "bg-[#1d4ed8] text-white", W: "bg-[#0d9488] text-white", F: "bg-[#7c3aed] text-white", D: "bg-[#b45309] text-white", G: "bg-[#0284c7] text-white", BN: "bg-[#1e293b] text-[#94a3b8]", TAXI: "bg-[#451a03] text-[#f59e0b] border border-[#78350f]", IR: "bg-[#4c0519] text-[#f43f5e] border border-[#881337]",
}

function isInvalidRosterPlacement(player: Player): boolean {
  const injured = player.status === "IR" || player.status === "O" || player.status === "DTD"
  if (player.slot === "BN") return false
  if (player.slot === "TAXI") return player.nhlGamesPlayed == null || player.nhlGamesPlayed >= TAXI_MAX_NHL_GAMES
  if (player.slot === "IR") return player.status !== "IR"
  return injured
}
export const PlayerItem = React.memo(function PlayerItem({
  player,
  fallbackSlot,
  onEdit,
  onSelect,
  nickname,
}: {
  player: Player | null
  fallbackSlot: string
  onEdit: (player: Player | null, fallbackSlot: string) => void
  onSelect: (player: Player) => void
  nickname?: string
}) {
  if (!player) {
    return (
      <button type="button" onClick={() => onEdit(null, fallbackSlot)} className="flex min-h-11 w-full cursor-pointer items-center justify-between border-b border-[#0f1726] px-3.5 py-2 text-left transition-colors hover:bg-[#16233b] active:scale-[0.99]">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex h-7 min-w-7 shrink-0 items-center justify-center rounded-[5px] px-1 text-xs font-black uppercase", slotBadgeColors[fallbackSlot])}>
            {fallbackSlot}
          </span>
          <span className="text-xs font-bold text-[#45546d]">Empty</span>
        </div>
        <span className="text-xs font-bold text-[#45546d]">—</span>
      </button>
    )
  }

  return (
    <div className={cn("flex items-center justify-between border-b border-[#0f1726] px-3.5 py-2 transition-colors", isInvalidRosterPlacement(player) ? "bg-rose-500/10" : "hover:bg-[#0c1220]")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={() => onEdit(player, fallbackSlot)}
          className={cn("flex h-7 min-w-7 shrink-0 items-center justify-center rounded-[5px] px-1 text-xs font-black uppercase transition-transform active:scale-95", slotBadgeColors[player.slot] || slotBadgeColors[player.position])}
        >
          {player.slot}
        </button>

        <button type="button" onClick={() => onSelect(player)} className="flex min-h-11 min-w-11 items-center gap-2.5 cursor-pointer text-left">
          <PlayerPortrait player={player} name={player.name} className="size-8 border border-[#1b263b]" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-bold tracking-tight leading-tight text-white">{player.name}</p>
              {player.status && (
                <span className={cn("shrink-0 rounded px-1 text-xs font-black uppercase", player.status === "DTD" ? "bg-amber-400/20 text-amber-300" : "bg-[#ff2a85]/20 text-[#ff2a85]")}>
                  {player.status}
                </span>
              )}
            </div>
            {nickname && <p className="truncate text-xs italic text-[#5e7090]">{nickname}</p>}
            <p className="truncate text-xs text-[#5e7090] leading-tight">
              <span className="font-semibold text-zinc-300">{player.position}</span> - {player.team} • {player.schedule ? `${player.schedule.day} ${player.schedule.time}` : "No game this week"} 
            </p>
          </div>
        </button>
      </div>

      <button type="button" onClick={() => onSelect(player)} className="min-h-11 min-w-11 shrink-0 cursor-pointer pl-2 text-right">
        <p className="text-xs font-black text-white tabular-nums leading-tight">{getWeekActualPoints(player).toFixed(1)}</p>
        <p className="text-xs font-semibold text-[#5e7090] tabular-nums leading-tight">{player.schedule ? `${player.schedule.weekGamesPlayed} GP` : "week"}</p>
      </button>
    </div>
  )
})
