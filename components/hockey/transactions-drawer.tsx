"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import type { ActivityItem, WaiverClaim } from "@/lib/hockey-data"

type ShownClaim = WaiverClaim & { outcome?: string | null }

export function TransactionsDrawer({ open, claims, activities, onOpenChange, onCancel, onBudgetChange, teamId }: {
  open: boolean
  claims: WaiverClaim[]
  activities: ActivityItem[]
  onOpenChange: (open: boolean) => void
  onCancel: (claim: WaiverClaim) => void
  onBudgetChange?: (budget: { faabBalance: number; committedFaab: number }) => void
  teamId?: string
}) {
  const [selected, setSelected] = useState<ShownClaim | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [liveClaims, setLiveClaims] = useState<ShownClaim[]>(claims)
  const budgetRequest = useRef(0)
  const onBudgetChangeRef = useRef(onBudgetChange)
  onBudgetChangeRef.current = onBudgetChange
  useEffect(() => {
    if (!teamId) setLiveClaims(claims)
  }, [claims, teamId])
  const loadClaims = useCallback(async () => {
    if (!teamId) return
    const requestId = ++budgetRequest.current
    try {
      const response = await fetch(`/api/waivers?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" })
      if (!response.ok || requestId !== budgetRequest.current) return
      const data = await response.json() as { claims?: ShownClaim[]; faabBalance?: number; committedFaab?: number }
      if (requestId !== budgetRequest.current) return
      setLiveClaims(data.claims ?? [])
      if (typeof data.faabBalance === "number" && typeof data.committedFaab === "number") {
        onBudgetChangeRef.current?.({ faabBalance: data.faabBalance, committedFaab: data.committedFaab })
      }
    } catch (error: unknown) {
      console.error("Could not load waiver claims", error)
    }
  }, [teamId])
  useEffect(() => {
    if (!open || !teamId) return
    void loadClaims()
  }, [open, teamId, loadClaims])
  const displayedClaims = teamId ? liveClaims : claims
  const pending = displayedClaims.filter((claim) => claim.status !== "won" && claim.status !== "failed")
  const results = displayedClaims.filter((claim) => claim.status === "won" || claim.status === "failed")
  const committedFaab = pending.reduce((sum, claim) => sum + claim.bidAmount, 0)
  const close = () => { setSelected(null); setConfirming(false); setCancelError(null); onOpenChange(false) }
  const confirmCancel = async () => {
    if (!selected || cancelling) return
    if (!teamId) {
      onCancel(selected)
      setSelected(null)
      setConfirming(false)
      setCancelError(null)
      return
    }
    setCancelling(true)
    setCancelError(null)
    try {
      const response = await fetch("/api/waivers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId, claimId: selected.id }) })
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: string } | null
        setCancelError(failure?.error ?? "Could not cancel waiver.")
        return
      }
      setLiveClaims((current) => current.filter((claim) => claim.id !== selected.id))
      onCancel(selected)
      void loadClaims()
      setSelected(null)
      setConfirming(false)
      setCancelError(null)
    } catch (error: unknown) {
      console.error("Could not cancel waiver", error)
      setCancelError("Could not cancel waiver.")
    } finally {
      setCancelling(false)
    }
  }
  return (
    <Sheet open={open} onOpenChange={(value) => !value && close()}>
      <SheetContent side="bottom" spring="gentle" className="mx-auto max-h-[82vh] max-w-[430px] overflow-y-auto rounded-t-2xl border-t border-[#1a263d] bg-[#0d1424] p-0 text-white">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#5e7090]" />
        <div className="flex items-center justify-between border-b border-[#172338] px-4 pb-3 pt-2">
          <h2 className="text-lg font-black">Transactions</h2>
          <button type="button" onClick={close} aria-label="Close"><X className="size-5 text-[#8ba0c7]" /></button>
        </div>
        <div className="p-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-[#5e7090]">Waiver Claims</h3>
          {committedFaab > 0 && <p className="mt-2 text-xs text-[#8ba0c7]">${committedFaab} FAAB committed to pending claims</p>}
          {pending.length === 0 && results.length === 0 && <p className="mt-2 rounded-lg border border-dashed border-[#263858] p-3 text-xs text-[#5e7090]">No pending waivers</p>}
          {pending.length === 0 && results.length > 0 && <p className="mt-2 rounded-lg border border-[#172338] bg-[#111c30] p-3 text-xs text-[#8ba0c7]">Waivers have processed.</p>}
          {pending.length > 0 && (
            <div className="mt-2 space-y-2">
              {pending.map((claim, index) => (
                <button key={claim.id} type="button" onClick={() => { setSelected(claim); setConfirming(false); setCancelError(null) }} className="flex w-full items-center gap-3 rounded-lg border border-[#172338] bg-[#111c30] p-3 text-left">
                  <span className="text-lg font-black text-[#5e7090]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[#19ffff]">+ ADD {claim.playerToAdd.name}</p>
                    <p className="truncate text-xs font-bold text-[#ff2a85]">- DROP {claim.playerToDrop?.name ?? "No player"}</p>
                    <p className="mt-1 text-xs text-[#8ba0c7]">For next week&apos;s lineup · Monday midnight</p>
                  </div>
                  <div className="text-right text-xs font-bold text-[#5e7090]">BID ${claim.bidAmount}</div>
                </button>
              ))}
            </div>
          )}
          {results.length > 0 && (
            <>
              <h3 className="mt-6 text-xs font-black uppercase tracking-wider text-[#5e7090]">Recent results</h3>
              <div className="mt-2 space-y-2">
                {results.map((claim) => (
                  <div key={claim.id} className="flex items-center gap-3 rounded-lg border border-[#172338] bg-[#111c30] p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-white">+ ADD {claim.playerToAdd.name}</p>
                      <p className="truncate text-xs text-[#5e7090]">- DROP {claim.playerToDrop?.name ?? "No player"} · ${claim.bidAmount}</p>
                    </div>
                    <p className={claim.status === "won" ? "text-xs font-black text-[#19ffff]" : "text-xs font-black text-[#ff2a85]"}>{claim.outcome ?? (claim.status === "won" ? "Won" : "Not awarded")}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          <h3 className="mt-6 text-xs font-black uppercase tracking-wider text-[#5e7090]">Transaction History</h3>
          <div className="mt-2 space-y-2">
            {activities.map((activity) => (
              <div key={activity.id} className="rounded-lg border border-[#172338] bg-[#111c30] p-3">
                <p className="text-xs text-[#5e7090]">{activity.owner} · {activity.time}</p>
                <p className="mt-1 text-xs font-bold text-white">
                  <span className={activity.action === "ADD" ? "text-[#19ffff]" : "text-[#ff2a85]"}>{activity.action === "ADD" ? "+ ADD" : activity.action === "DROP" ? "- DROP" : "TRADE"}</span> {activity.player} <span className="text-[#5e7090]">({activity.detail})</span>
                </p>
              </div>
            ))}
          </div>
        </div>
        {selected && selected.status !== "won" && selected.status !== "failed" && (
          <div className="border-t border-[#172338] bg-[#101829] p-4">
            <p className="text-sm font-black text-white">{confirming ? "Cancel Waiver - Please confirm you want to do this!" : `Manage waiver for ${selected.playerToAdd.name}`}</p>
            <p className="mt-1 text-xs text-[#8ba0c7]">This add is for next week&apos;s lineup. It processes Monday at midnight, after the final game.</p>
            {confirming ? (
              <div className="mt-3">
                {cancelError && <p role="alert" className="mb-2 text-xs font-bold text-rose-400">{cancelError}</p>}
                <div className="flex gap-2">
                  <button type="button" disabled={cancelling} onClick={() => { setConfirming(false); setCancelError(null) }} className="h-10 flex-1 rounded-full bg-[#172338] text-xs font-black text-white disabled:opacity-40">No</button>
                  <button type="button" disabled={cancelling} onClick={() => void confirmCancel()} className="h-10 flex-1 rounded-full bg-[#ff2a85] text-xs font-black text-white disabled:opacity-40">{cancelling ? "Cancelling..." : "Yes"}</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setSelected(null)} className="h-10 flex-1 rounded-full bg-[#172338] text-xs font-black text-white">Cancel</button>
                <button type="button" onClick={() => setConfirming(true)} className="h-10 flex-1 rounded-full bg-[#ff2a85] text-xs font-black uppercase text-white">Cancel Waiver</button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
