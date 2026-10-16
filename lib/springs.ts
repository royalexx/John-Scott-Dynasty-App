import type { Transition } from "motion/react"

/** Sleeper's Reanimated 3 presets. Motion uses the same stiffness, damping, and mass on the web. */
export const springs = {
  gentle: { type: "spring", stiffness: 900, damping: 120, mass: 4 },
  snappy: { type: "spring", stiffness: 900, damping: 110, mass: 4, bounce: 0 },
  wiggly: { type: "spring", stiffness: 900, damping: 90, mass: 4 },
} as const satisfies Record<string, Transition>

export type SpringName = keyof typeof springs

/** CSS stand-in for Base UI sheets, which own their own open/close lifecycle. */
export const springClass: Record<SpringName, string> = {
  gentle: "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
  snappy: "duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]",
  wiggly: "duration-500 ease-[cubic-bezier(0.34,1.45,0.64,1)]",
}
