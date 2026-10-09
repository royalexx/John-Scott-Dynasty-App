"use client"

import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { Player } from "@/lib/hockey-data"
import { PlayerDetailDialog } from "@/components/hockey/player-detail-dialog"
import { PlayerPortrait } from "@/components/hockey/player-portrait"

// Exact Sleeper position container badge colors
const slotBadgeStyles: Record<string, string> = {
  C: "bg-[#2563eb] text-white",         // Blue
  W: "bg-[#0d9488] text-white",         // Teal / Cyan
  F: "bg-[#7c3aed] text-white",         // Purple
  D: "bg-[#b45309] text-white",         // Amber / Orange
  G: "bg-[#0284c7] text-white",         // Ice / Sky Blue
  BN: "bg-[#162238] text-[#627494] border border-[#1f2f4c]",
  TAXI: "bg-[#2a2010] text-[#f59e0b] border border-[#423315]",
  IR: "bg-[#33121c] text-[#ff2a85] border border-[#541e2e]",
}

const positionTextColors: Record<Player["position"], string> = {
  C: "text-[#3b82f6]",
  LW: "text-[#14b8a6]",
  RW: "text-[#14b8a6]",
  D: "text-[#f59e0b]",
  G: "text-[#38bdf8]",
}

const statusBadgeStyles: Record<string, string> = {
  IR: "bg-[#ff2a85]/15 text-[#ff2a85] border border-[#ff2a85]/30",
  O: "bg-[#ff2a85]/15 text-[#ff2a85] border border-[#ff2a85]/30",
  DTD: "bg-amber-400/15 text-amber-300 border border-amber-400/30",
  TAXI: "bg-amber-400/15 text-amber-300 border border-amber-400/30",
}

export function PlayerRow({
  player,
  onEditSlot,
  onSelect,
}: {
  player: Player
  onEditSlot?: () => void
  onSelect?: (player: Player) => void
}) {
  const [open, setOpen] = useState(false)

  const badgeClass = slotBadgeStyles[player.slot] || slotBadgeStyles[player.position] || slotBadgeStyles.BN

  return (
    <>
      <div className="flex w-full items-center justify-between border-b border-[#121a2c] bg-[#080c14] px-3.5 py-2.5 transition-colors hover:bg-[#0d1524]">
        {/* Left Side: Slot container badge + Avatar + Names */}
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Position Slot Container Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEditSlot?.()
            }}
            title="Swap position slot"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-[5px] text-[11px] font-black uppercase transition-transform active:scale-95",
              badgeClass,
              onEditSlot && "cursor-pointer hover:brightness-110",
            )}
          >
            {player.slot}
          </button>

          {/* Player Clickable Row */}
          <button
            type="button"
            onClick={() => onSelect ? onSelect(player) : setOpen(true)}
            className="flex min-w-0 items-center gap-2.5 text-left"
          >
            <PlayerPortrait player={player} name={player.name} className="size-8 border border-[#202e48] bg-[#141d2f]" />

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-black tracking-tight text-white">{player.name}</p>
                {player.status && (
                  <span className={cn("shrink-0 rounded px-1 py-0.2 text-[9px] font-black", statusBadgeStyles[player.status])}>
                    {player.status}
                  </span>
                )}
              </div>
              <p className="truncate text-[10px] text-[#5e7090]">
                <span className={cn("font-bold", positionTextColors[player.position])}>{player.position}</span>
                {" • "}
                <span>{player.team}</span>
                {" • "}
                <span>{player.opponent}</span>
              </p>
            </div>
          </button>
        </div>

        {/* Right Side: Fantasy Points & Projected Points */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-right"
        >
          <p className="text-xs font-black tabular-nums text-white">
            {player.todayPts != null ? player.todayPts.toFixed(2) : "—"}
          </p>
          <p className="text-[10px] font-bold tabular-nums text-[#5e7090]">
            proj {(player.schedule?.weekProjectedFantasyPoints ?? player.projPts).toFixed(2)}
          </p>
        </button>
      </div>

      <PlayerDetailDialog
        player={{
          name: player.name,
          position: player.position,
          team: player.team,
          opponent: player.opponent,
          status: player.status,
          todayPts: player.todayPts,
          projPts: player.projPts,
        }}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}