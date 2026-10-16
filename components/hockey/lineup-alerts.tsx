import { AlertTriangle, CheckCircle2, Lock } from "lucide-react"
import { isStarterSlot, type Player } from "@/lib/hockey-data"

type Props = {
  roster: Player[]
  capacities: Record<string, number>
  irSlots: number
  lock?: { mode: "WEEKLY" | "DAILY"; locked: boolean; weekEndDate: string }
}

/** Sleeper-style lineup health check: injured starters, empty starting slots and IR players parked elsewhere. */
export function LineupAlerts({ roster, capacities, irSlots, lock }: Props) {
  const issues: string[] = []
  const starters = roster.filter((player) => isStarterSlot(player.slot))
  const injured = starters.filter((player) => player.status === "O" || player.status === "IR")
  const dtd = starters.filter((player) => player.status === "DTD")
  const emptyStarters = Object.entries(capacities).reduce((sum, [slot, capacity]) => isStarterSlot(slot as Player["slot"]) ? sum + Math.max(0, capacity - starters.filter((player) => player.slot === slot).length) : sum, 0)
  const irParked = roster.filter((player) => player.status === "IR" && player.slot !== "IR")
  const irOpen = Math.max(0, irSlots - roster.filter((player) => player.slot === "IR").length)

  if (emptyStarters > 0) issues.push(`${emptyStarters} empty starting slot${emptyStarters === 1 ? "" : "s"}`)
  if (injured.length > 0) issues.push(`${injured.map((player) => player.name).slice(0, 2).join(", ")}${injured.length > 2 ? ` +${injured.length - 2}` : ""} injured in your lineup`)
  if (dtd.length > 0) issues.push(`${dtd.length} day-to-day starter${dtd.length === 1 ? "" : "s"}`)
  if (irParked.length > 0 && irOpen > 0) issues.push(`${irParked[0].name} can move to IR`)

  const lockBanner = lock?.locked
    ? <div role="status" data-testid="lineup-lock-banner" className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/5 px-3 py-2 text-xs font-bold text-sky-300"><Lock className="size-4 shrink-0" />{lock.mode === "WEEKLY" ? "Starters are locked until Monday (first game of the week has started)" : "Players whose game has started are locked today"}</div>
    : null

  if (issues.length === 0) {
    return <>{lockBanner}<div role="status" className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs font-bold text-emerald-300"><CheckCircle2 className="size-4 shrink-0" />Lineup is set</div></>
  }
  return (
    <>
    {lockBanner}
    <div role="alert" className="mx-3 mt-3 rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-300"><AlertTriangle className="size-4 shrink-0" />Lineup needs attention</p>
      <ul className="mt-1 space-y-0.5 pl-6 text-xs text-[#c9b27a]">{issues.map((issue) => <li key={issue} className="list-disc">{issue}</li>)}</ul>
    </div>
    </>
  )
}
