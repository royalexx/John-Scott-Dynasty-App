import { AlertTriangle, ArrowRight, CheckCircle2, Lock } from "lucide-react"
import { TAXI_MAX_NHL_GAMES, isStarterSlot, type Player } from "@/lib/hockey-data"
import { positionFitsSlot } from "@/lib/roster-eligibility"

type Props = {
  roster: Player[]
  capacities: Record<string, number>
  irSlots: number
  lock?: { mode: "WEEKLY" | "DAILY"; locked: boolean; weekEndDate: string }
  onReview?: (player: Player | null, slot: Player["slot"]) => void
}

/** Sleeper-style lineup health check: injured starters, empty starting slots and IR players parked elsewhere. */
export function LineupAlerts({ roster, capacities, irSlots, lock, onReview }: Props) {
  const issues: string[] = []
  const starters = roster.filter((player) => isStarterSlot(player.slot))
  const injured = starters.filter((player) => player.status === "O" || player.status === "IR")
  const dtd = starters.filter((player) => player.status === "DTD")
  const emptyStarters = Object.entries(capacities).reduce((sum, [slot, capacity]) => isStarterSlot(slot as Player["slot"]) ? sum + Math.max(0, capacity - starters.filter((player) => player.slot === slot).length) : sum, 0)
  const irParked = roster.filter((player) => player.status === "IR" && player.slot !== "IR")
  const healthyOnIr = roster.filter((player) => player.slot === "IR" && (player.status === "HEALTHY" || player.injuryStatus === "HEALTHY"))
  const irOpen = Math.max(0, irSlots - roster.filter((player) => player.slot === "IR").length)
  const taxiViolations = roster.filter((player) => player.slot === "TAXI" && (player.nhlGamesPlayed ?? 0) >= TAXI_MAX_NHL_GAMES)
  const outOfPosition = starters.filter((player) => !positionFitsSlot(player.slot, player.position))

  // Suggest a single, reversible next step. Opening the swap sheet never writes
  // to PostgreSQL; a manager must still choose an eligible replacement.
  const firstEmptyStarter = Object.entries(capacities).find(([slot, capacity]) =>
    isStarterSlot(slot) && starters.filter((player) => player.slot === slot).length < capacity
  )?.[0]
  const firstReviewPlayer = injured[0] ?? outOfPosition[0] ?? dtd[0] ?? taxiViolations[0] ??
    (irOpen > 0 ? irParked[0] : undefined) ?? healthyOnIr[0]
  const reviewTarget = firstEmptyStarter
    ? { player: null, slot: firstEmptyStarter as Player["slot"], label: `Fill empty ${firstEmptyStarter} slot` }
    : firstReviewPlayer
      ? { player: firstReviewPlayer, slot: firstReviewPlayer.slot, label: `Review ${firstReviewPlayer.name}` }
      : null

  if (emptyStarters > 0) issues.push(`${emptyStarters} empty starting slot${emptyStarters === 1 ? "" : "s"}`)
  if (injured.length > 0) issues.push(`${injured.map((player) => player.name).slice(0, 2).join(", ")}${injured.length > 2 ? ` +${injured.length - 2}` : ""} injured in your lineup`)
  if (dtd.length > 0) issues.push(`${dtd.length} day-to-day starter${dtd.length === 1 ? "" : "s"}`)
  if (outOfPosition.length > 0) issues.push(`${outOfPosition.map((player) => player.name).slice(0, 2).join(", ")}${outOfPosition.length > 2 ? ` +${outOfPosition.length - 2}` : ""} out of position`)
  if (taxiViolations.length > 0) issues.push(`${taxiViolations.map((player) => player.name).slice(0, 2).join(", ")}${taxiViolations.length > 2 ? ` +${taxiViolations.length - 2}` : ""} ineligible for the taxi squad (${TAXI_MAX_NHL_GAMES}+ NHL GP)`)
  if (irParked.length > 0 && irOpen > 0) issues.push(`${irParked[0].name} can move to IR`)
  for (const player of healthyOnIr) issues.push(`${player.name} is healthy and can be activated from IR`)

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
      {onReview && reviewTarget && (
        <button type="button" data-testid="lineup-review-action" onClick={() => onReview(reviewTarget.player, reviewTarget.slot)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {reviewTarget.label}<ArrowRight aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
    </>
  )
}
