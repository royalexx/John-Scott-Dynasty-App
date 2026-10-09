import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { activities, teamSchedule, type Player, type WaiverClaim } from "@/lib/hockey-data"
import { TransactionsDrawer } from "@/components/hockey/transactions-drawer"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import type { TeamAction } from "@/components/hockey/team-header"
export function TeamDrawer({
  type,
  roster,
  playerNicknames,
  setNickname,
  teamName,
  setTeamName,
  teamLogo,
  setTeamLogo,
  pendingClaims,
  onCancelClaim,
  onClose,
}: {
  type: Exclude<TeamAction, "trade"> | null
  roster: Player[]
  playerNicknames: Record<string, string>
  setNickname: (id: string, value: string) => void
  teamName: string
  setTeamName: (value: string) => void
  teamLogo: string
  setTeamLogo: (value: string) => void
  pendingClaims: WaiverClaim[]
  onCancelClaim: (claim: WaiverClaim) => void
  onClose: () => void
}) {
  const [news, setNews] = useState<Array<{ id: string; headline: string; description: string; published: string | null; url: string | null }>>([])
  useEffect(() => {
    if (type !== "news") return
    fetch("/api/news", { cache: "no-store" }).then((response) => response.json()).then((data: { articles?: typeof news }) => setNews(data.articles ?? [])).catch((error) => console.error("Failed to load ESPN news:", error))
  }, [type])
  if (!type) return null
  if (type === "transactions") return <TransactionsDrawer open claims={pendingClaims} activities={activities} onOpenChange={(open) => !open && onClose()} onCancel={onCancelClaim} />
  const title = type === "schedule" ? "Schedule" : type === "settings" ? "My Team Settings" : "Player News"
  return (
    <Sheet open={type !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[82vh] max-w-[430px] overflow-y-auto rounded-t-2xl border-t border-[#1a263d] bg-[#0d1424] p-0 text-white">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#5e7090]" />
        <div className="flex items-center justify-between border-b border-[#172338] px-4 pb-3 pt-2"><h2 className="text-lg font-black">{title}</h2><button type="button" onClick={onClose} aria-label="Close drawer" className="rounded-full p-2 text-[#8ba0c7] hover:bg-[#172338]"><X className="size-5" /></button></div>
        {type === "schedule" && <div className="divide-y divide-[#172338]">{teamSchedule.map((row, index) => <div key={row.week} className="flex items-center gap-3 px-4 py-3"><span className={cn("rounded-md px-2 py-1 text-[10px] font-black", row.week === 8 ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>Wk {row.week}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{teamName} <span className="text-[#5e7090]">vs</span> {row.opponent}</p><p className="text-[10px] text-[#5e7090]">{row.opponentOwner}</p></div><div className="text-right">{row.result === "SCHEDULED" ? <span className="text-[10px] text-[#5e7090]">TBD</span> : <><p className="text-[10px] tabular-nums text-white">{row.score}</p><span className={cn("text-[9px] font-black", row.result === "WIN" ? "text-emerald-400" : "text-[#ff2a85]")}>{row.result}</span></>}</div></div>)}</div>}
        {type === "settings" && <div className="space-y-4 p-4"><div className="rounded-lg border border-[#172338] bg-[#141e33] p-3"><p className="text-[10px] font-black uppercase text-[#5e7090]">My Team</p><input value={teamName} onChange={(event) => setTeamName(event.target.value)} className="mt-2 w-full rounded-md border border-[#263858] bg-[#0d1424] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#19ffff]" /><input value={teamLogo} onChange={(event) => setTeamLogo(event.target.value)} placeholder="Team logo URL (optional)" className="mt-2 w-full rounded-md border border-[#263858] bg-[#0d1424] px-3 py-2 text-sm text-white outline-none focus:border-[#19ffff]" /></div><div><p className="mb-2 text-sm font-black text-white">Player Nicknames</p><div className="space-y-2">{roster.map((player) => <label key={player.id} className="block rounded-lg border border-[#172338] bg-[#111c30] p-2.5"><span className="block text-xs font-bold text-white">{player.name}</span><input value={playerNicknames[player.id] ?? ""} onChange={(event) => setNickname(player.id, event.target.value)} placeholder="Enter nickname" className="mt-1 w-full bg-transparent text-xs text-[#8ba0c7] outline-none placeholder:text-[#5e7090]" /></label>)}</div></div></div>}
        {type === "news" && <div className="space-y-2 p-4">{news.map((item) => <article key={item.id} className="rounded-lg border border-[#172338] bg-[#111c30] p-3"><p className="text-[9px] font-black uppercase text-[#5e7090]">ESPN NHL News</p><h3 className="mt-1 text-xs font-bold text-[#19ffff]">{item.headline}</h3><p className="mt-1 text-[11px] leading-relaxed text-[#8ba0c7]">{item.description}</p>{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-black text-white underline">Read on ESPN</a>}</article>)}</div>}
      </SheetContent>
    </Sheet>
  )
}
