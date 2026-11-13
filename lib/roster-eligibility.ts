/** Position groups that may occupy a starting slot. Bench, taxi, and IR are not position-gated. */
export const STARTER_ELIGIBILITY: Record<string, readonly string[]> = {
  C: ["C"],
  W: ["LW", "RW"],
  F: ["C", "LW", "RW"],
  D: ["D"],
  G: ["G"],
}

export const DEFAULT_BENCH_CAPACITY = 7

/** Taxi and injured reserve sit outside the active roster cap (starters + bench). */
export const RESERVE_SLOTS = ["TAXI", "IR", "IR_PLUS"] as const

export function isReserveSlot(slot: string): boolean {
  return (RESERVE_SLOTS as readonly string[]).includes(slot)
}

export function countActiveRosterSlots(slots: ReadonlyArray<{ slot: string }>): number {
  return slots.filter((entry) => !isReserveSlot(entry.slot)).length
}

/** A waiver acquisition lands on BN, even when the player being dropped is a starter. */
export function hasRoomForBenchAcquisition(
  slots: ReadonlyArray<{ playerId: number; slot: string }>,
  activeLimit: number,
  benchLimit: number,
  dropPlayerId?: number | null,
): boolean {
  if (!Number.isInteger(activeLimit) || activeLimit <= 0 || !Number.isInteger(benchLimit) || benchLimit <= 0) return false
  const retained = dropPlayerId == null ? slots : slots.filter((slot) => slot.playerId !== dropPlayerId)
  return countActiveRosterSlots(retained) < activeLimit &&
    retained.filter((slot) => slot.slot === "BN").length < benchLimit
}

export function positionFitsSlot(slot: string, position: string): boolean {
  const allowed = STARTER_ELIGIBILITY[slot]
  return !allowed || allowed.includes(position)
}

/**
 * Where the player leaving a full slot should land.
 * They take the vacated slot only when their position can play it.
 * Otherwise they go to the bench when there is room.
 * A full bench and an illegal vacated slot means the swap is not allowed.
 */
export function displacedLandingSlot(vacatedSlot: string, position: string, benchHasRoom: boolean): string | null {
  if (positionFitsSlot(vacatedSlot, position)) return vacatedSlot
  if (benchHasRoom && vacatedSlot !== "BN") return "BN"
  return null
}
