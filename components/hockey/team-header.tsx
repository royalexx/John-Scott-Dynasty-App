import { Calendar, ArrowLeftRight, Receipt, Newspaper, Pencil } from "lucide-react"

type TeamAction = "schedule" | "team-settings" | "settings" | "transactions" | "news" | "trade"
export type { TeamAction }
function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export function TeamHeader({ teamName, logoUrl, standing, rank, pendingClaims, faabBalance, onAction }: { teamName: string; logoUrl?: string; standing?: { wins: number; losses: number; pointsFor: number; pointsAgainst: number; streak?: string | null }; rank: number; pendingClaims: number; faabBalance?: number; onAction: (action: TeamAction) => void }) {
  const actions = [
    { label: "sched.", icon: Calendar, action: "schedule" as const },
    { label: "trade", icon: ArrowLeftRight, action: "trade" as const },
    { label: "trans.", icon: Receipt, action: "transactions" as const },
    { label: "news", icon: Newspaper, action: "news" as const },
  ]
  return (
    <section className="border-b border-[#111929] bg-[#0d1424] px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center overflow-hidden rounded-full border border-[#24375b] bg-[#1b2842] text-lg">{logoUrl ? <img src={logoUrl} alt="" className="size-full object-cover" /> : "🏒"}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black text-white">{teamName}</p>
          <p className="text-xs font-bold text-[#8ba0c7]">{standing ? `${standing.wins}-${standing.losses}` : "0-0"}{rank > 0 ? ` • ${ordinal(rank)}` : ""}{standing?.streak ? ` • ${standing.streak}` : ""}</p>
          <p className="text-xs text-[#5e7090]">FAAB ${faabBalance ?? 100} • PF {(standing?.pointsFor ?? 0).toFixed(1)} • PA {(standing?.pointsAgainst ?? 0).toFixed(1)}</p>
        </div>
        <button type="button" onClick={() => onAction("team-settings")} aria-label="Edit team customization" className="rounded-full p-2 text-[#8ba0c7] hover:bg-[#172338]"><Pencil className="size-5" /></button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {actions.map(({ label, icon: Icon, action }) => <button key={label} type="button" onClick={() => onAction(action)} className="flex flex-col items-center gap-1 text-xs font-black text-[#8ba0c7] hover:text-[#19ffff]"><span className="relative flex size-8 items-center justify-center rounded-full border border-[#263858] bg-[#141e33]"><Icon className="size-4" />{action === "transactions" && pendingClaims > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#f43f5e] text-xs font-black text-white shadow-md">{pendingClaims}</span>}</span>{label}</button>)}
      </div>
    </section>
  )
}
