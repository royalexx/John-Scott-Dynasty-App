import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { getScheduleForTeam, type ActivityItem, type Player, type WaiverClaim } from "@/lib/hockey-data"
import { TransactionsDrawer } from "@/components/hockey/transactions-drawer"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import type { TeamAction } from "@/components/hockey/team-header"
import { CommissionerSettingsDialog } from "@/components/hockey/commissioner-settings-dialog"

export function getOrdinal(n: number) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function TeamDrawer({
  type,
  roster,
  playerNicknames,
  setNickname,
  teamName,
  setTeamName,
  teamLogo,
  setTeamLogo,
  managerHandle,
  isCommissioner,
  pendingClaims,
  teamId,
  activities,
  onCancelClaim,
  onSaveSettings,
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
  managerHandle?: string
  isCommissioner?: boolean
  pendingClaims: WaiverClaim[]
  teamId?: string
  activities: ActivityItem[]
  onCancelClaim: (claim: WaiverClaim) => void
  onSaveSettings: () => void
  onClose: () => void
}) {
  const [news, setNews] = useState<Array<{ id: string; headline: string; description: string; published: string | null; url: string | null }>>([])
  const [commissionerStatus, setCommissionerStatus] = useState<string | null>(null)
  const [commishModalOpen, setCommishModalOpen] = useState(false)
  const [managers, setManagers] = useState<Array<{ id: string; name: string; handle: string; isCommissioner: boolean }>>([])
  const [selectedManagerId, setSelectedManagerId] = useState("")
  const runCommissionerAction = async (endpoint: string, label: string) => {
    setCommissionerStatus(`${label}...`)
    try {
      const response = await fetch(endpoint, { method: "POST" })
      if (!response.ok) throw new Error(`${label} failed (${response.status})`)
      setCommissionerStatus(`${label} complete`)
    } catch (error) {
      console.error(`Commissioner action failed: ${label}`, error)
      setCommissionerStatus(`${label} failed`)
    }
  }
  useEffect(() => {
    if (type !== "news") return
    fetch("/api/news", { cache: "no-store" }).then((response) => response.json()).then((data: { articles?: typeof news }) => setNews(data.articles ?? [])).catch((error) => console.error("Failed to load ESPN news:", error))
  }, [type])
  useEffect(() => {
    if (type !== "settings" || !isCommissioner) return
    fetch("/api/admin/roles", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ managers?: typeof managers }> : Promise.reject(new Error(`Role list failed (${response.status})`)))
      .then((data) => setManagers(data.managers ?? []))
      .catch((error: unknown) => console.error("Failed to load commissioner roles:", error))
  }, [isCommissioner, type])
  const updateCoCommissioner = async (value: boolean) => {
    if (!selectedManagerId) return
    const response = await fetch("/api/admin/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetManagerId: selectedManagerId, isCommissioner: value }),
    })
    setCommissionerStatus(response.ok ? "Co-commissioner status updated" : `Role update failed (${response.status})`)
    if (response.ok) setManagers((current) => current.map((manager) => manager.id === selectedManagerId ? { ...manager, isCommissioner: value } : manager))
  }
  if (!type) return null
  if (type === "transactions") return <TransactionsDrawer open teamId={teamId} claims={pendingClaims} activities={activities} onOpenChange={(open) => !open && onClose()} onCancel={onCancelClaim} />
  const title = type === "schedule" ? "Schedule" : type === "team-settings" ? "Team Settings" : type === "settings" ? "League Settings" : "Player News"
  return (
    <Sheet open={type !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[82vh] max-w-[430px] overflow-y-auto rounded-t-2xl border-t border-[#1a263d] bg-[#0d1424] p-0 text-white">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#5e7090]" />
        <div className="flex items-center justify-between border-b border-[#172338] px-4 pb-3 pt-2"><h2 className="text-lg font-black">{title}</h2><button type="button" onClick={onClose} aria-label="Close drawer" className="rounded-full p-2 text-[#8ba0c7] hover:bg-[#172338]"><X className="size-5" /></button></div>
        {type === "schedule" && <div className="divide-y divide-[#172338]">{getScheduleForTeam(teamName).map((row) => <div key={row.week} className="flex items-center gap-3 px-4 py-3"><span className={cn("rounded-md px-2 py-1 text-[10px] font-black", row.week === 8 ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>Wk {row.week}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{teamName} <span className="text-[#5e7090]">vs</span> {row.opponent}</p><p className="text-[10px] text-[#5e7090]">{row.opponentOwner}</p></div><div className="text-right">{row.result === "SCHEDULED" ? <span className="text-[10px] text-[#5e7090]">TBD</span> : <><p className="text-[10px] tabular-nums text-white">{row.score}</p><span className={cn("text-[9px] font-black", row.result === "WIN" ? "text-emerald-400" : "text-[#ff2a85]")}>{row.result}</span></>}</div></div>)}</div>}
        {type === "team-settings" && <div className="space-y-4 p-4"><div className="rounded-lg border border-[#172338] bg-[#141e33] p-3"><p className="text-[10px] font-black uppercase text-[#5e7090]">My Team</p><input value={teamName} onChange={(event) => setTeamName(event.target.value)} className="mt-2 w-full rounded-md border border-[#263858] bg-[#0d1424] px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#19ffff]" /><input value={teamLogo} onChange={(event) => setTeamLogo(event.target.value)} placeholder="Team logo URL (optional)" className="mt-2 w-full rounded-md border border-[#263858] bg-[#0d1424] px-3 py-2 text-sm text-white outline-none focus:border-[#19ffff]" /><button type="button" onClick={onSaveSettings} className="mt-3 w-full rounded-full bg-[#19ffff] py-2 text-xs font-black text-[#080c14]">Save Team Settings</button></div><div><p className="mb-2 text-sm font-black text-white">Player Nicknames</p><div className="space-y-2">{roster.map((player) => <label key={player.id} className="block rounded-lg border border-[#172338] bg-[#111c30] p-2.5"><span className="block text-xs font-bold text-white">{player.name}</span><input value={playerNicknames[player.id] ?? ""} onChange={(event) => setNickname(player.id, event.target.value)} placeholder="Enter nickname" className="mt-1 w-full bg-transparent text-xs text-[#8ba0c7] outline-none placeholder:text-[#5e7090]" /></label>)}</div></div></div>}
        {type === "settings" && <div className="space-y-4 p-4">{isCommissioner ? <div className="space-y-2 rounded-lg border border-amber-500/30 bg-[#161a29] p-3"><p className="text-[10px] font-black uppercase text-amber-400">Commissioner Tools</p><button type="button" onClick={() => setCommishModalOpen(true)} className="flex w-full items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"><span>Open Commissioner Rulebook &amp; Settings</span><span>&gt;</span></button><button type="button" onClick={() => void runCommissionerAction("/api/cron/sync", "NHL score sync")} className="w-full rounded-lg border border-[#263858] bg-[#0d1424] py-2.5 text-left text-xs font-bold text-[#8ba0c7] hover:text-white">Force NHL Sync</button><button type="button" onClick={() => void runCommissionerAction("/api/cron/waivers", "Waiver processing")} className="w-full rounded-lg border border-[#263858] bg-[#0d1424] py-2.5 text-left text-xs font-bold text-[#8ba0c7] hover:text-white">Run Waivers</button><div className="mt-3 border-t border-amber-500/20 pt-3"><p className="mb-1 text-[10px] font-black uppercase text-amber-300">Co-commissioner</p><select value={selectedManagerId} onChange={(event) => setSelectedManagerId(event.target.value)} className="w-full rounded-lg bg-[#0d1424] p-2 text-xs text-white"><option value="">Select a manager</option>{managers.filter((manager) => manager.handle !== managerHandle).map((manager) => <option key={manager.id} value={manager.id}>@{manager.handle}{manager.isCommissioner ? " (active)" : ""}</option>)}</select>{selectedManagerId && <div className="mt-2 flex gap-2"><button type="button" onClick={() => void updateCoCommissioner(true)} className="flex-1 rounded-lg bg-emerald-500/15 py-2 text-[10px] font-bold text-emerald-300">Grant</button><button type="button" onClick={() => void updateCoCommissioner(false)} className="flex-1 rounded-lg bg-rose-500/15 py-2 text-[10px] font-bold text-rose-300">Revoke</button></div>}</div><p className="text-[10px] text-[#8ba0c7]">Taxi Squad Game Cap: &lt; 160 GP</p>{commissionerStatus && <p role="status" className="text-[10px] text-[#8ba0c7]">{commissionerStatus}</p>}</div> : <p className="rounded-lg border border-[#172338] bg-[#111c30] p-3 text-[10px] text-[#8ba0c7]">Commissioner tools are managed by @commissioner.</p>}<div className="border-t border-[#172338] pt-4"><button type="button" onClick={async () => { await fetch("/api/auth/session", { method: "DELETE" }); window.location.reload() }} className="w-full rounded-xl border border-rose-500/40 bg-rose-500/10 py-2.5 text-xs font-bold text-rose-400 transition hover:bg-rose-500/20 active:scale-95">Switch Team / Log Out</button></div><CommissionerSettingsDialog open={commishModalOpen} onOpenChange={setCommishModalOpen} /></div>}
        {type === "news" && <div className="space-y-2 p-4">{news.map((item) => <article key={item.id} className="rounded-lg border border-[#172338] bg-[#111c30] p-3"><p className="text-[9px] font-black uppercase text-[#5e7090]">ESPN NHL News</p><h3 className="mt-1 text-xs font-bold text-[#19ffff]">{item.headline}</h3><p className="mt-1 text-[11px] leading-relaxed text-[#8ba0c7]">{item.description}</p>{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-black text-white underline">Read on ESPN</a>}</article>)}</div>}
      </SheetContent>
    </Sheet>
  )
}
