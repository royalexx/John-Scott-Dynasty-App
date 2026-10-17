/** Position groups that may occupy a starting slot. Bench, taxi, and IR are not position-gated. */
const STARTER_ELIGIBILITY: Record<string, readonly string[]> = {
  C: ["C"],
  W: ["LW", "RW"],
  F: ["C", "LW", "RW"],
  D: ["D"],
  G: ["G"],
}

export const DEFAULT_BENCH_CAPACITY = 7

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
