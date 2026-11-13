import * as React from "react"
import { cn } from "@/lib/utils"

type SurfaceProps = React.ComponentProps<"section"> & {
  elevated?: boolean
}

/** Shared card anatomy for subsequent Match, Team, Players and League work. */
function HockeySurface({ className, elevated = false, ...props }: SurfaceProps) {
  return (
    <section
      data-slot="hockey-surface"
      className={cn(
        "rounded-2xl border border-border p-4 text-foreground",
        elevated ? "bg-surface-raised shadow-md" : "bg-surface",
        className,
      )}
      {...props}
    />
  )
}

type SectionHeadingProps = {
  title: string
  eyebrow?: string
  action?: React.ReactNode
  className?: string
}

function HockeySectionHeading({ title, eyebrow, action, className }: SectionHeadingProps) {
  return (
    <div data-slot="hockey-section-heading" className={cn("flex min-w-0 items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-muted">{eyebrow}</p>}
        <h2 className="truncate text-lg font-bold leading-tight text-foreground">{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

type StatusTone = "neutral" | "live" | "success" | "warning" | "danger"
const statusToneClasses: Record<StatusTone, string> = {
  neutral: "border-border bg-surface-hover text-text-secondary",
  live: "border-brand/40 bg-brand/10 text-brand",
  success: "border-success/40 bg-success-surface text-success",
  warning: "border-warning/40 bg-warning-surface text-warning",
  danger: "border-danger/40 bg-danger-surface text-danger",
}

/** Use labels instead of relying on color alone (e.g. 'Questionable'). */
function HockeyStatus({ label, tone = "neutral", className }: {
  label: string
  tone?: StatusTone
  className?: string
}) {
  return <span data-slot="hockey-status" className={cn("inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-bold", statusToneClasses[tone], className)}>{label}</span>
}

/** Standard compact hockey position indicator; does not replace player photos. */
const positionClasses: Record<string, string> = {
  C: "bg-position-c text-white",
  W: "bg-position-w text-white",
  LW: "bg-position-w text-white",
  RW: "bg-position-w text-white",
  F: "bg-position-f text-white",
  D: "bg-position-d text-position-ink",
  G: "bg-position-g text-position-ink",
  BN: "bg-surface-hover text-text-secondary",
  TAXI: "bg-warning-surface text-warning",
  IR: "bg-danger-surface text-danger",
}
function PositionBadge({ position, className }: { position: string; className?: string }) {
  const label = position === "LW" || position === "RW" ? "W" : position === "TAXI" ? "TX" : position
  return (
    <span data-slot="hockey-position" aria-label={`Position ${position}`} className={cn(
      "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-extrabold uppercase",
      positionClasses[position] ?? "bg-surface-hover text-text-secondary",
      className,
    )}>{label}</span>
  )
}

function HockeyStat({ label, value, detail, className }: {
  label: string
  value: React.ReactNode
  detail?: string
  className?: string
}) {
  return (
    <div data-slot="hockey-stat" className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <span className="ui-stat-number truncate text-lg font-bold leading-none text-foreground">{value}</span>
      {detail && <span className="text-xs text-text-secondary">{detail}</span>}
    </div>
  )
}

export { HockeySurface, HockeySectionHeading, HockeyStatus, PositionBadge, HockeyStat }
