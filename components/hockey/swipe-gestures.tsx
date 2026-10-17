"use client"

import { Children, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { animate, motion, useMotionValue, type MotionValue } from "motion/react"
import { springs, type SpringName } from "@/lib/springs"
import { cn } from "@/lib/utils"

type Direction = "left" | "right"
type Axis = "horizontal" | "vertical"
type ProgressInput = ((continuousIndex: number) => void) | MotionValue<number>

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

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

function publishProgress(target: ProgressInput | undefined, progress: number) {
  if (!target || !Number.isFinite(progress)) return
  if (typeof target === "function") target(progress)
  else target.set(progress)
}

function paneWidthFor(width: number, peekPx: number, gapPx: number) {
  if (width <= 0) return 0
  if (peekPx > 0) return Math.max(1, width - peekPx - gapPx)
  return width
}

type DragState = {
  x: number
  y: number
  startTrackX: number
  time: number
  locked: Axis | null
  pointerId: number
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

/**
 * 1:1 horizontal pager. The track follows the finger, then snaps by distance or velocity.
 * `fill` stretches the track to the pager height (main tabs). Matchup cards stay content-sized
 * and use `peekPx` / `gapPx` so the next card stays in view.
 */
export function SwipePager({
  zone,
  activeIndex,
  itemCount,
  onIndexChange,
  onProgressChange,
  loop = false,
  peekPx = 0,
  gapPx = 0,
  fill = false,
  className,
  children,
}: {
  zone: string
  activeIndex: number
  itemCount: number
  onIndexChange: (nextIndex: number) => void
  onProgressChange?: ProgressInput
  loop?: boolean
  peekPx?: number
  gapPx?: number
  fill?: boolean
  className?: string
  children: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const x = useMotionValue(0)
  const drag = useRef<DragState | null>(null)
  const dragDistance = useRef(0)
  const controls = useRef<{ stop: () => void } | null>(null)
  const animatingTo = useRef<number | null>(null)
  const lastWidth = useRef(0)
  const widthRef = useRef(0)
  const strideRef = useRef(0)
  const activeIndexRef = useRef(0)
  const itemCountRef = useRef(itemCount)
  const loopRef = useRef(loop)
  const onIndexChangeRef = useRef(onIndexChange)
  const onProgressRef = useRef(onProgressChange)

  const childArray = Children.toArray(children)
  const pageCount = itemCount > 0 ? Math.min(itemCount, childArray.length) : childArray.length
  const paneWidth = paneWidthFor(width, peekPx, gapPx)
  const stride = paneWidth > 0 ? paneWidth + gapPx : 0
  const safeIndex = pageCount <= 0 ? 0 : Math.min(Math.max(activeIndex, 0), pageCount - 1)

  widthRef.current = width
  strideRef.current = stride
  activeIndexRef.current = safeIndex
  itemCountRef.current = pageCount
  loopRef.current = loop
  onIndexChangeRef.current = onIndexChange
  onProgressRef.current = onProgressChange

  const animateToRef = useRef<(index: number, immediate?: boolean) => void>(() => {})
  animateToRef.current = (index: number, immediate = false) => {
    const currentStride = strideRef.current
    const count = itemCountRef.current
    if (currentStride <= 0 || count <= 0) return
    const safe = Math.min(Math.max(index, 0), count - 1)
    const target = -safe * currentStride
    controls.current?.stop()
    animatingTo.current = safe
    if (immediate || prefersReducedMotion()) {
      x.set(target)
      return
    }
    controls.current = animate(x, target, springs.snappy)
  }

  useIsoLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () => {
      const style = getComputedStyle(element)
      const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      const next = Math.max(0, Math.round(element.clientWidth - pad))
      if (next === widthRef.current) return
      widthRef.current = next
      setWidth(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [setWidth])

  useIsoLayoutEffect(() => {
    const emit = (latest: number) => {
      const currentStride = strideRef.current
      if (currentStride <= 0) return
      publishProgress(onProgressRef.current, -latest / currentStride)
    }
    emit(x.get())
    return x.on("change", emit)
  }, [x])

  useIsoLayoutEffect(() => {
    if (stride <= 0) return
    const widthChanged = width !== lastWidth.current
    lastWidth.current = width
    if (drag.current?.locked === "horizontal") return
    if (!widthChanged && animatingTo.current === safeIndex) return
    animateToRef.current(safeIndex, widthChanged || !Number.isFinite(x.get()))
  }, [safeIndex, width, stride, gapPx, peekPx, x])

  useEffect(() => () => controls.current?.stop(), [])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragDistance.current = 0
    if (nestedClaim(event.target, zone)) return
    // A press that ends outside the element never delivers pointerup. Replace
    // that stale gesture so the next one is not ignored.
    controls.current?.stop()
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      startTrackX: x.get(),
      time: performance.now(),
      locked: null,
      pointerId: event.pointerId,
    }
  }

  const onPointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = drag.current
    if (!origin || origin.pointerId !== event.pointerId || origin.locked === "horizontal") return
    drag.current = null
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = drag.current
    if (!origin || origin.pointerId !== event.pointerId || origin.locked === "vertical") return
    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y
    if (origin.locked !== "horizontal") {
      if (Math.hypot(dx, dy) <= 8) return
      if (Math.abs(dy) > Math.abs(dx)) {
        origin.locked = "vertical"
        return
      }
      if (Math.abs(dx) <= Math.abs(dy)) return
      origin.locked = "horizontal"
      try {
        event.currentTarget.setPointerCapture(origin.pointerId)
      } catch {
        origin.locked = "vertical"
        return
      }
    }
    dragDistance.current = dx
    const currentStride = strideRef.current
    let next = origin.startTrackX + dx
    if (!loopRef.current && currentStride > 0) {
      const max = 0
      const min = -(itemCountRef.current - 1) * currentStride
      if (next > max) next = max + (next - max) * 0.25
      else if (next < min) next = min + (next - min) * 0.25
    }
    x.set(next)
    event.preventDefault()
  }

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, cancel: boolean) => {
    const origin = drag.current
    if (!origin || origin.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(origin.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(origin.pointerId)
      } catch {
        // The pointer can already be gone on cancel.
      }
    }
    if (cancel || origin.locked !== "horizontal") {
      dragDistance.current = 0
      if (origin.locked === "horizontal") animateToRef.current(activeIndexRef.current)
      return
    }
    const dx = event.clientX - origin.x
    dragDistance.current = dx
    const elapsed = Math.max((performance.now() - origin.time) / 1000, 0.016)
    const vx = dx / elapsed
    const currentStride = strideRef.current
    let next = activeIndexRef.current
    if (currentStride > 0 && (dx < -currentStride * 0.22 || vx < -320)) next += 1
    else if (currentStride > 0 && (dx > currentStride * 0.22 || vx > 320)) next -= 1
    const count = itemCountRef.current
    if (count <= 0) return
    if (loopRef.current) next = ((next % count) + count) % count
    else next = Math.max(0, Math.min(count - 1, next))
    animateToRef.current(next)
    if (next !== activeIndexRef.current) onIndexChangeRef.current(next)
  }

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (Math.abs(dragDistance.current) <= 10) return
    event.preventDefault()
    event.stopPropagation()
    dragDistance.current = 0
  }

  const renderOrder = pageCount > 0 ? [safeIndex, ...childArray.map((_, index) => index).filter((index) => index !== safeIndex)] : []

  return (
    <div
      ref={containerRef}
      data-swipe={zone}
      className={cn("relative min-w-0 overflow-hidden", fill && "flex min-h-0 flex-1 flex-col", className)}
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishDrag(event, false)}
      onPointerCancel={(event) => finishDrag(event, true)}
      onPointerLeave={onPointerLeave}
      onClickCapture={onClickCapture}
    >
      <motion.div className={cn("flex w-full min-w-0", fill && "h-full min-h-0 flex-1")} style={{ x, gap: gapPx }}>
        {renderOrder.map((index) => (
          <div
            key={index}
            aria-hidden={index === safeIndex ? undefined : true}
            inert={fill && index !== safeIndex ? true : undefined}
            className={cn("min-w-0 overflow-hidden", fill && "h-full min-h-0")}
            style={{ order: index, width: paneWidth > 0 ? paneWidth : "100%", flex: "0 0 auto" }}
          >
            {childArray[index]}
          </div>
        ))}
      </motion.div>
    </div>
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
      <div className="pointer-events-none absolute inset-y-0 left-0 z-0 flex w-24 items-center bg-[#19ffff] pl-3 text-xs font-black uppercase text-[#080c14]">{rightLabel}</div>
      <div className="pointer-events-none absolute inset-y-0 right-0 z-0 flex w-24 items-center justify-end bg-[#ff2a85] pr-3 text-xs font-black uppercase text-white">{leftLabel}</div>
      {/* Absolute rails paint above an in-flow row. Keep the lineup positioned so Bench/Block stay hidden until the swipe. */}
      <motion.div className="relative z-10 w-full bg-[#070a12]" style={{ x, touchAction: "pan-y" }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { start.current = null; animate(x, 0, springs.gentle) }}>
        {children}
      </motion.div>
    </div>
  )
}
