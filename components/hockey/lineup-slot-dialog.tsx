"use client"

import { Shield, X } from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { TAXI_MAX_NHL_GAMES, type Player } from "@/lib/hockey-data"
import { PlayerPortrait } from "@/components/hockey/player-portrait"

type StartingSlot = Extract<Player["slot"], "C" | "W" | "F" | "D" | "G">

const slotColors: Record<StartingSlot | "BN" | "TAXI" | "IR", string> = {
  C: "bg-[#3b4cca] text-white",
  W: "bg-[#0d9488] text-white",
  F: "bg-[#7c3aed] text-white",
  D: "bg-[#b45309] text-white",
  G: "bg-[#0284c7] text-white",
  BN: "bg-[#1a253b] text-[#8ba0c7]",
  TAXI: "bg-[#1a253b] text-[#8ba0c7]",
  IR: "bg-[#3b1824] text-[#ff2a85]",
}

const capacities: Record<StartingSlot, number> = { C: 3, W: 6, F: 3, D: 6, G: 2 }

function eligibleStartingSlots(player: Player): StartingSlot[] {
  if (player.position === "C") return ["C", "F"]
  if (player.position === "LW" || player.position === "RW") return ["W", "F"]
  return [player.position]
}

function isInjured(player: Player): boolean {
  return player.status === "IR" || player.status === "O" || player.status === "DTD"
}

function isTaxiEligible(player: Player): boolean {
  return !isInjured(player) && player.nhlGamesPlayed != null && player.nhlGamesPlayed < TAXI_MAX_NHL_GAMES
}

function eligibleTargets(player: Player | null, roster: Player[], emptySlot?: StartingSlot) {
  const slots: Array<{ slot: Player["slot"]; label: string; target?: Player }> = []
  if (emptySlot) {
    return roster
      .filter((candidate) => candidate.slot === "BN" && eligibleStartingSlots(candidate).includes(emptySlot))
      .map((candidate) => ({ slot: emptySlot, label: "Empty starting slot", target: candidate }))
  }
  if (player && isInjured(player)) {
    if (player.slot !== "IR") slots.push({ slot: "IR", label: "Injured Reserve" })
    if (player.slot !== "BN") slots.push({ slot: "BN", label: "Bench player" })
  } else if (player?.slot === "BN" || player?.slot === "TAXI" || player?.slot === "IR") {
    eligibleStartingSlots(player).forEach((slot) => {
      const occupants = roster.filter((candidate) => candidate.slot === slot && candidate.id !== player.id)
      if (occupants.length) {
        occupants.forEach((target) => slots.push({ slot, label: "Swap starter", target }))
      }
      if (occupants.length < capacities[slot]) {
        slots.push({ slot, label: "Starting slot" })
      }
    })
  } else if (player) {
    eligibleStartingSlots(player).forEach((slot) => {
      roster.filter((candidate) => candidate.id !== player.id && candidate.slot === slot).forEach((target) => {
        slots.push({ slot, label: "Starting slot", target })
      })
      if (roster.filter((candidate) => candidate.slot === slot).length < capacities[slot]) slots.push({ slot, label: "Empty starting slot" })
    })
    roster
      .filter((candidate) => candidate.slot === "BN" && eligibleStartingSlots(candidate).some((slot) => eligibleStartingSlots(player).includes(slot)))
      .forEach((target) => {
        const destination = eligibleStartingSlots(player).find((slot) => eligibleStartingSlots(target).includes(slot))
        if (destination) slots.push({ slot: destination, label: "Bench player", target })
      })
  }
  if (player && isTaxiEligible(player) && player.slot !== "TAXI") slots.push({ slot: "TAXI", label: "Taxi Squad" })
  return slots.filter((option, index, all) => all.findIndex((candidate) => candidate.slot === option.slot && candidate.target?.id === option.target?.id) === index)
}

function PlayerAvatar({ player }: { player: Player }) {
  return <PlayerPortrait player={player} name={player.name} className="size-10 border border-[#24375b] bg-[#1b2842]" />
}

export function LineupSlotDialog({
  player,
  emptySlot,
  roster,
  open,
  onOpenChange,
  onMove,
  teamId,
}: {
  player: Player | null
  emptySlot?: StartingSlot | null
  roster: Player[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onMove: (playerId: string, destSlot: Player["slot"], targetPlayerId?: string) => void
  teamId?: string
}) {
  if (!open || (!player && !emptySlot)) return null
  const targets = eligibleTargets(player, roster, emptySlot ?? undefined)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-[430px] rounded-t-2xl border-t border-[#1a263d] bg-[#0d1424] p-0 text-white">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#5e7090]" />
        <div className="flex items-center justify-between px-4 pb-3 pt-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#5e7090]">1/1 Choose player to swap</p>
            <h2 className="text-lg font-black text-white">{player ? "Swap Player" : `Fill ${emptySlot} Slot`}</h2>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close swap player drawer" className="rounded-full p-2 text-[#8ba0c7] hover:bg-[#172338]"><X className="size-5" /></button>
        </div>

        <div className="mx-3 flex items-center gap-3 rounded-lg border border-[#1e2f4f] bg-[#141e33] p-3">
          <span className={cn("flex size-8 items-center justify-center rounded-md text-[10px] font-black", slotColors[player?.slot ?? emptySlot ?? "BN"])}>{player?.slot ?? emptySlot}</span>
          {player ? <PlayerAvatar player={player} /> : <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-[#34476a] text-[#5e7090]">+</div>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">{player?.name ?? `Empty ${emptySlot} starter`}</p>
            <p className="truncate text-[11px] text-[#5e7090]">{player ? <>{player.team} · {player.opponent}{player.status && <span className="ml-1 font-black text-rose-300">{player.status}</span>}</> : "Select an eligible bench player"}</p>
          </div>
          {player && <span className="text-sm font-black tabular-nums text-white">proj {(player.schedule?.weekProjectedFantasyPoints ?? player.projPts).toFixed(1)}</span>}
        </div>

        <div className="max-h-[45vh] overflow-y-auto px-3 pb-5">
          <p className="px-1 py-2 text-[10px] font-black uppercase tracking-wider text-[#5e7090]">Eligible swap targets</p>
          {targets.map((option, index) => (
            <button key={`${option.slot}-${option.target?.id ?? index}`} type="button" onClick={() => {
              const movedPlayer = player ?? option.target
              if (!movedPlayer) return
              if (teamId && movedPlayer.nhlId) {
                void fetch("/api/roster/move", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ teamId, playerId: movedPlayer.nhlId, targetSlot: option.slot }),
                }).then((response) => {
                  if (!response.ok) throw new Error("Could not update roster placement")
                  onMove(movedPlayer.id, option.slot, option.target?.id)
                  onOpenChange(false)
                }).catch((error: unknown) => console.error("Could not update roster placement", error))
                return
              }
              onMove(movedPlayer.id, option.slot, option.target?.id)
              onOpenChange(false)
            }} className="mb-1 flex w-full items-center gap-3 rounded-lg border border-[#172338] bg-[#111c30] p-3 text-left transition-colors hover:bg-[#172338]">
              <span className={cn("flex size-7 items-center justify-center rounded-md text-[10px] font-black", slotColors[option.slot as keyof typeof slotColors])}>{option.slot}</span>
              {option.target ? <><PlayerAvatar player={option.target} /><span className="min-w-0 flex-1"><b className="block truncate text-sm text-white">{option.target.name}</b><small className="text-[10px] text-[#5e7090]">{option.target.team} · {option.target.opponent}{option.target.status && <span className="ml-1 font-black text-rose-300">{option.target.status}</span>}</small></span><span className="text-xs font-black text-white">proj {(option.target.schedule?.weekProjectedFantasyPoints ?? option.target.projPts).toFixed(1)}</span></> : <span className="flex-1 text-sm font-bold text-white">{option.label}</span>}
            </button>
          ))}
          {!targets.length && <p className="rounded-lg border border-dashed border-[#34476a] px-3 py-5 text-center text-xs text-[#5e7090]">No eligible swap targets</p>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
