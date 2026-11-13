import { CalendarDays, ArrowLeftRight, ReceiptText, Newspaper, Pencil } from "lucide-react"
import { HockeyStat, HockeySurface } from "@/components/ui/hockey"

type TeamAction = "schedule" | "team-settings" | "settings" | "transactions" | "news" | "trade"
export type { TeamAction }

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

type TeamHeaderProps = {
  teamName: string
  logoUrl?: string
  standing?: { wins: number; losses: number; pointsFor: number; pointsAgainst: number; streak?: string | null }
  rank: number
  pendingClaims: number
  faabBalance?: number
  onAction: (action: TeamAction) => void
}

const actions = [
  { label: "Schedule", icon: CalendarDays, action: "schedule" as const },
  { label: "Trade", icon: ArrowLeftRight, action: "trade" as const },
  { label: "Activity", icon: ReceiptText, action: "transactions" as const },
  { label: "News", icon: Newspaper, action: "news" as const },
]

/** Team identity remains the visual focal point; stats and actions form separate scan zones. */
export function TeamHeader({ teamName, logoUrl, standing, rank, pendingClaims, faabBalance, onAction }: TeamHeaderProps) {
  return (
    <HockeySurface data-testid="team-identity" className="mx-3 mt-3 space-y-4 !p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border-strong bg-surface-raised text-2xl">
          {logoUrl ? <img src={logoUrl} alt={`${teamName} logo`} className="size-full object-cover" /> : <span aria-hidden="true">🏒</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-muted">My dynasty team</p>
          <h2 className="truncate text-lg font-extrabold leading-tight text-foreground">{teamName}</h2>
          <p className="mt-1 truncate text-xs font-semibold text-text-secondary">
            {standing ? `${standing.wins}–${standing.losses}` : "Record unavailable"}
            {rank > 0 ? ` · ${ordinal(rank)} place` : ""}
            {standing?.streak ? ` · ${standing.streak} streak` : ""}
          </p>
        </div>
        <button type="button" onClick={() => onAction("team-settings")} aria-label="Edit team customization" className="ui-touch-target flex shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-hover hover:text-foreground">
          <Pencil className="size-5" />
        </button>
      </div>

      <div data-testid="team-stats" className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-background p-3">
        <HockeyStat label="FAAB" value={faabBalance == null ? "—" : `$${faabBalance}`} />
        <HockeyStat label="Pts for" value={standing ? standing.pointsFor.toFixed(1) : "—"} />
        <HockeyStat label="Pts against" value={standing ? standing.pointsAgainst.toFixed(1) : "—"} />
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-border pt-3" aria-label="Team actions">
        {actions.map(({ label, icon: Icon, action }) => (
          <button key={action} type="button" aria-label={action} onClick={() => onAction(action)}
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface-raised px-1 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <span className="relative flex size-5 items-center justify-center">
              <Icon className="size-5 text-brand" aria-hidden="true" />
              {action === "transactions" && pendingClaims > 0 && (
                <span aria-label={`${pendingClaims} pending claims`} className="absolute -right-3 -top-2 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-black text-primary-foreground">
                  {pendingClaims}
                </span>
              )}
            </span>
            <span className="truncate text-[11px]">{label}</span>
          </button>
        ))}
      </div>
    </HockeySurface>
  )
}
