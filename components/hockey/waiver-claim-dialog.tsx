"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Check, ChevronLeft, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { DEFAULT_ROSTER_SIZE, isStarterSlot, type MarketPlayer, type Player, type WaiverClaim } from "@/lib/hockey-data"
import { PlayerPortrait } from "@/components/hockey/player-portrait"

const colors: Record<string, string> = {
  C: "bg-[#1d4ed8] text-white",
  W: "bg-[#0d9488] text-white",
  LW: "bg-[#0d9488] text-white",
  RW: "bg-[#0d9488] text-white",
  F: "bg-[#7c3aed] text-white",
  D: "bg-[#b45309] text-white",
  G: "bg-[#0284c7] text-white",
  BN: "bg-[#1e293b] text-[#cbd5e1]",
  TAXI: "bg-[#451a03] text-[#f59e0b]",
  IR: "bg-[#4c0519] text-[#f43f5e]",
}

function DropRow({ player, selected, onSelect }: { player: Player; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 border-b border-[#172338] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[#0f1828]/80",
        selected && "bg-[#0c2231]"
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-[#19ffff] bg-[#19ffff] text-[#080c14]" : "border-[#5e7090]"
        )}
      >
        {selected && <Check className="size-3" />}
      </span>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-black",
          colors[player.slot] || colors[player.position] || "bg-[#1e293b] text-white"
        )}
      >
        {player.slot}
      </span>
      <PlayerPortrait player={player} name={player.name} className="size-7 bg-[#1b2842]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-white">{player.name}</span>
        <span className="block text-[10px] text-[#5e7090]">{player.team} · {player.opponent}</span>
      </span>
      <span className="text-xs font-black tabular-nums text-white">
        {(player.schedule?.weekProjectedFantasyPoints ?? player.projPts).toFixed(1)}
      </span>
    </button>
  )
}

export function WaiverClaimDialog({
  player,
  roster,
  userFaab,
  teamName,
  open,
  onOpenChange,
  onConfirm,
  teamId,
  rosterSize = DEFAULT_ROSTER_SIZE,
}: {
  player: MarketPlayer | null
  roster: Player[]
  userFaab: number
  teamName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (claim: WaiverClaim) => void
  teamId?: string
  /** League roster capacity; drops are optional only while the roster is below this. */
  rosterSize?: number
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [bid, setBid] = useState(0)
  const [dropId, setDropId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const dropGroups = useMemo(
    () => ({
      STARTERS: roster.filter((p) => isStarterSlot(p.slot)),
      BENCH: roster.filter((p) => p.slot === "BN"),
      "TAXI SQUAD": roster.filter((p) => p.slot === "TAXI"),
    }),
    [roster]
  )

  const dropped = roster.find((p) => p.id === dropId)
  const openSpots = Math.max(0, rosterSize - roster.length)
  const rosterFull = openSpots === 0

  if (!open || !player) return null

  const close = () => {
    setStep(1)
    setDropId(null)
    setBid(0)
    setError(null)
    setSubmitting(false)
    onOpenChange(false)
  }

  const confirm = () => {
    // A drop is only mandatory when the roster is full; open bench spots allow a pure add.
    if (rosterFull && !dropped) {
      setError("Your roster is full. Select a player to drop.")
      return
    }
    const localClaim: WaiverClaim = {
      id: `claim-${Date.now()}`,
      playerToAdd: player,
      playerToDrop: dropped ?? null,
      bidAmount: bid,
      status: "pending",
      runTime: "Wed 3:05 AM",
    }
    if (teamId && player.nhlId) {
      setSubmitting(true)
      setError(null)
      void fetch("/api/waivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, playerToAddId: player.nhlId, playerToDropId: dropped?.nhlId ?? null, bidAmount: bid }),
      }).then(async (response) => {
        const data = await response.json() as { error?: string; claim?: { id?: string } }
        if (!response.ok || !data.claim) throw new Error(data.error ?? "Could not submit waiver claim")
        onConfirm({ ...localClaim, id: data.claim.id ?? localClaim.id })
        close()
      }).catch((caught: unknown) => {
        console.error("Could not submit waiver claim", caught)
        setError(caught instanceof Error ? caught.message : "Could not submit waiver claim")
        setSubmitting(false)
      })
      return
    }
    onConfirm(localClaim)
    close()
  }

  return (
    <Sheet open={open} onOpenChange={(value) => !value && close()}>
      <SheetContent
        side="bottom"
        className="mx-auto flex h-[90vh] max-h-[90vh] max-w-[430px] flex-col rounded-t-3xl border-t border-[#1a263d] bg-[#070a12] p-0 text-white outline-none"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#5e7090]" />

        {step === 1 ? (
          <>
            <header className="flex shrink-0 items-center justify-between border-b border-[#172338] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-[#1b2842]">🏒</span>
                <div>
                  <h2 className="text-sm font-black">+ ADD {player.name}</h2>
                  <p className="text-[10px] text-[#5e7090]">
                    {player.position} · {player.team} · {teamName}
                  </p>
                </div>
              </div>
              <button type="button" onClick={close} aria-label="Close">
                <X className="size-5 text-[#8ba0c7]" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <section className="px-4 py-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#5e7090]">Bid Amount</p>
              <div className="mx-auto mt-2 flex w-32 items-center justify-center rounded-lg border border-[#263858] bg-[#101829] px-2">
                <span className="text-xl font-black text-[#19ffff]">$</span>
                <input
                  aria-label="Bid amount"
                  type="number"
                  min={0}
                  max={userFaab}
                  value={bid}
                  onChange={(e) =>
                    setBid(Math.max(0, Math.min(userFaab, Number(e.target.value) || 0)))
                  }
                  className="w-20 bg-transparent py-2 text-center text-2xl font-black text-white outline-none"
                />
              </div>
              <p className="mt-1 text-xs text-[#5e7090]">${userFaab} remaining</p>
            </section>

            <div className="mx-3 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              {rosterFull ? "Your roster is full, please select a player to drop" : `${openSpots} open roster spot${openSpots === 1 ? "" : "s"} available - dropping a player is optional`}
            </div>

            <div className="px-3 pb-3">
              {!rosterFull && <button type="button" onClick={() => { setDropId(null); setStep(2) }} className="mb-2 w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-left text-xs font-bold text-emerald-300">+ Do not drop any player ({openSpots} open roster spot{openSpots === 1 ? "" : "s"})</button>}
              <p className="mt-4 px-1 text-[10px] font-black uppercase tracking-wider text-[#5e7090]">
                Select Player to Drop
              </p>
              {Object.entries(dropGroups).map(([group, players]) => (
                <div key={group}>
                  <p className="mt-3 px-1 text-[10px] font-black text-[#8ba0c7]">{group}</p>
                  {players.map((candidate) => (
                    <DropRow
                      key={candidate.id}
                      player={candidate}
                      selected={dropId === candidate.id}
                      onSelect={() => setDropId(candidate.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
            </div>

            <div className="shrink-0 border-t border-[#1a263d] bg-[#070a12] p-4">
              <button
                type="button"
                disabled={rosterFull && !dropped}
                onClick={() => setStep(2)}
                className="h-11 w-full cursor-pointer rounded-full bg-[#19ffff] text-sm font-black uppercase tracking-wider text-[#080c14] transition-all duration-150 hover:brightness-110 hover:shadow-[0_0_16px_rgba(25,255,255,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <header className="flex shrink-0 items-center justify-between border-b border-[#172338] px-4 py-3">
              <div>
                <h2 className="text-lg font-black">Confirm Transaction</h2>
                <p className="text-xs text-[#5e7090]">Add player to your roster</p>
              </div>
              <button type="button" onClick={close} aria-label="Close">
                <X className="size-5 text-[#8ba0c7]" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <span className="rounded bg-[#19ffff]/15 px-2 py-1 text-[10px] font-black text-[#19ffff]">
                {player.waiver === "FA" ? "FREE AGENCY" : "WAIVERS"}
              </span>

              <div className="mt-4 rounded-xl border border-[#1b2b46] bg-[#121c2e] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black text-[#19ffff]">+ ADD</span>
                    <p className="mt-1 text-xs font-bold text-white">{player.name}</p>
                    <p className="text-[10px] text-[#5e7090]">
                      {player.position} · {player.team}
                    </p>
                  </div>

                  <ChevronLeft className="size-4 rotate-180 text-[#5e7090]" />

                  <div>
                    <span className="text-[10px] font-black text-[#ff2a85]">- DROP</span>
                    <p className="mt-1 text-xs font-bold text-white">{dropped?.name ?? "None (Keep open roster spot)"}</p>
                    {dropped && <p className="text-[10px] text-[#5e7090]">{dropped.position} · {dropped.team}</p>}
                  </div>

                  <div className="text-right">
                    <p className="text-[9px] font-black text-[#5e7090]">BID</p>
                    <p className="text-lg font-black text-white">${bid}</p>
                  </div>
                </div>
              </div>

              {error && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-bold text-rose-300">{error}</p>}
              <button
                type="button"
                onClick={confirm}
                disabled={submitting}
                className="mt-5 h-11 w-full cursor-pointer rounded-full bg-[#19ffff] text-sm font-black uppercase tracking-wider text-[#080c14] transition-all duration-150 hover:brightness-110 hover:shadow-[0_0_16px_rgba(25,255,255,0.4)] active:scale-[0.98]"
              >
                Confirm
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}