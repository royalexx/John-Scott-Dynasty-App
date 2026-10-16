"use client"

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { animate, motion, useMotionValue } from "motion/react"
import { springs, type SpringName } from "@/lib/springs"

type Direction = "left" | "right"

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function nestedClaim(target: EventTarget | null, zone: string) {
  const element = target instanceof Element ? target : null
  if (!element) return false
  const claim = element.closest("[data-swipe]")
  if (claim && claim.getAttribute("data-swipe") !== zone) return true
  return Boolean(element.closest("[data-swipe-ignore], input, textarea, select"))
}

/** Horizontal swipe that springs back. Vertical movement keeps normal scrolling. */
export function useHorizontalSwipe(zone: string, onSwipe: (direction: Direction) => void, enabled = true) {
  const start = useRef<{ x: number; y: number; ignore: boolean } | null>(null)
  const x = useMotionValue(0)

  const finish = (direction: Direction) => {
    if (prefersReducedMotion()) {
      x.set(0)
      onSwipe(direction)
      return
    }
    animate(x, direction === "left" ? -28 : 28, { duration: 0.08 }).finished.then(() => {
      onSwipe(direction)
      animate(x, 0, springs.snappy)
    })
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0) return
    start.current = {
      x: event.clientX,
      y: event.clientY,
      ignore: nestedClaim(event.target, zone),
    }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = start.current
    if (!origin || origin.ignore) return
    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return
    x.set(Math.max(-48, Math.min(48, dx * 0.35)))
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = start.current
    start.current = null
    if (!origin) return
    if (origin.ignore) return
    event.stopPropagation()
    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.25) {
      animate(x, 0, springs.gentle)
      return
    }
    finish(dx < 0 ? "left" : "right")
  }
  const onPointerCancel = () => {
    start.current = null
    animate(x, 0, springs.gentle)
  }

  return {
    x,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  }
}

export function SwipeSurface({
  zone,
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
  className,
  children,
}: {
  zone: string
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  enabled?: boolean
  className?: string
  children: ReactNode
}) {
  const swipe = useHorizontalSwipe(zone, (direction) => {
    if (direction === "left") onSwipeLeft?.()
    else onSwipeRight?.()
  }, enabled)
  return (
    <motion.div data-swipe={zone} className={className} style={{ x: swipe.x, touchAction: "pan-y" }} {...swipe.handlers}>
      {children}
    </motion.div>
  )
}

/** Roster-row swipe. Right reveals the lineup action. Left reveals trade block. */
export function SwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel,
  leftLabel,
  spring = "wiggly",
}: {
  children: ReactNode
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  rightLabel: string
  leftLabel: string
  spring?: SpringName
}) {
  const start = useRef<{ x: number; y: number; pointer: number } | null>(null)
  const x = useMotionValue(0)
  const moved = useRef(false)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    moved.current = false
    start.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = start.current
    if (!origin) return
    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y
    if (!moved.current && Math.abs(dx) < 10) return
    if (!moved.current && Math.abs(dy) > Math.abs(dx)) {
      start.current = null
      return
    }
    moved.current = true
    event.currentTarget.setPointerCapture(origin.pointer)
    x.set(Math.max(-104, Math.min(104, dx)))
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = start.current
    start.current = null
    if (!origin) return
    const dx = x.get()
    if (Math.abs(dx) > 64) {
      event.stopPropagation()
      if (dx > 0) onSwipeRight?.()
      else onSwipeLeft?.()
    }
    animate(x, 0, springs[spring])
  }

  return (
    <div data-swipe="row" className="relative overflow-hidden" onPointerUp={(event) => { if (moved.current) event.stopPropagation() }}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex w-24 items-center bg-[#19ffff] pl-3 text-xs font-black uppercase text-[#080c14]">{rightLabel}</div>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-24 items-center justify-end bg-[#ff2a85] pr-3 text-xs font-black uppercase text-white">{leftLabel}</div>
      <motion.div className="bg-[#070a12]" style={{ x, touchAction: "pan-y" }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { start.current = null; animate(x, 0, springs.gentle) }}>
        {children}
      </motion.div>
    </div>
  )
}
