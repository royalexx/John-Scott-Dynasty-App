"use client"

import { useEffect, useState } from "react"
import { ChevronRight, Crown, LockKeyhole, LogOut, RefreshCw, Shield, Swords } from "lucide-react"
import { CommissionerSettingsDialog, defaultLeagueSettings, mergeLeagueSettings, type LeagueSettings } from "@/components/hockey/commissioner-settings-dialog"
import { cn } from "@/lib/utils"

type Manager = { id: string; name: string; handle: string; isCommissioner: boolean }
type LeagueInfo = LeagueSettings & { name?: string; rosterSize?: number }

const SCORING_LABELS: Array<[string, string]> = [["goal", "G"], ["assist", "A"], ["shot", "SOG"], ["hit", "HIT"], ["block", "BLK"], ["ppp", "PPP"], ["shg", "SHG"], ["gwg", "GWG"], ["plusMinus", "+/-"], ["win", "W"], ["save", "SV"], ["goalsAgainst", "GA"], ["shutout", "SO"], ["overtimeLoss", "OTL"]]

function pinDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 4)
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-1.5 text-xs"><span className="text-[#8ba0c7]">{label}</span><span className="text-right font-bold text-white">{value}</span></div>
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl border border-[#172338] bg-[#0f1829] p-3"><h3 className="mb-1 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#5e7090]">{icon}{title}</h3><div className="divide-y divide-[#172338]">{children}</div></section>
}

export function LeagueSettingsPanel({ managerHandle, isCommissioner, teamName, rank, faab, waiverPriority }: { managerHandle?: string; isCommissioner?: boolean; teamName: string; rank: number; faab?: number; waiverPriority?: number }) {
  const [league, setLeague] = useState<LeagueInfo>(defaultLeagueSettings)
  const [loaded, setLoaded] = useState(false)
  const [managers, setManagers] = useState<Manager[]>([])
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rulebookOpen, setRulebookOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [pinBusy, setPinBusy] = useState(false)
  const [pinStatus, setPinStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/league-settings", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Partial<LeagueInfo>> : Promise.reject(new Error(`Settings failed (${response.status})`)))
      .then((data) => { if (!cancelled) { setLeague({ ...mergeLeagueSettings(defaultLeagueSettings, data), name: data.name, rosterSize: data.rosterSize }); setLoaded(true) } })
      .catch((error: unknown) => console.error("Failed to load league settings", error))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isCommissioner) return
    let cancelled = false
    fetch("/api/admin/roles", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ managers?: Manager[] }> : Promise.reject(new Error(`Role list failed (${response.status})`)))
      .then((data) => { if (!cancelled) setManagers(data.managers ?? []) })
      .catch((error: unknown) => console.error("Failed to load commissioner roles", error))
    return () => { cancelled = true }
  }, [isCommissioner])

  const run = async (endpoint: string, label: string) => {
    setBusy(label)
    setStatus(null)
    try {
      const response = await fetch(endpoint, { method: "POST" })
      const data = await response.json().catch(() => null) as { message?: string } | null
      setStatus({ ok: response.ok, text: response.ok ? (data?.message ?? `${label} complete`) : `${label} failed (${response.status})` })
    } catch (error: unknown) {
      console.error(`Commissioner action failed: ${label}`, error)
      setStatus({ ok: false, text: `${label} failed` })
    } finally {
      setBusy(null)
    }
  }

  const setRole = async (manager: Manager, value: boolean) => {
    setBusy(manager.id)
    try {
      const response = await fetch("/api/admin/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetManagerId: manager.id, isCommissioner: value }) })
      if (!response.ok) throw new Error(`Role update failed (${response.status})`)
      setManagers((current) => current.map((item) => item.id === manager.id ? { ...item, isCommissioner: value } : item))
      setStatus({ ok: true, text: `@${manager.handle} is ${value ? "now a co-commissioner" : "no longer a commissioner"}` })
    } catch (error: unknown) {
      console.error("Role update failed", error)
      setStatus({ ok: false, text: "Role update failed" })
    } finally {
      setBusy(null)
    }
  }

  const changePin = async () => {
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
      setPinStatus({ ok: false, text: "Current PIN and new PIN must be 4 digits." })
      return
    }
    if (newPin !== confirmPin) {
      setPinStatus({ ok: false, text: "New PIN and confirmation do not match." })
      return
    }
    setPinBusy(true)
    setPinStatus(null)
    try {
      const response = await fetch("/api/auth/login", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        setPinStatus({ ok: false, text: data?.error ?? "Could not change PIN." })
        return
      }
      setCurrentPin("")
      setNewPin("")
      setConfirmPin("")
      setPinStatus({ ok: true, text: "PIN updated." })
    } catch (error: unknown) {
      console.error("PIN update failed", error)
      setPinStatus({ ok: false, text: "Could not change PIN." })
    } finally {
      setPinBusy(false)
    }
  }

  const positions = league.rosterPositions
  const capacity = league.rosterSize ?? Object.values(positions).reduce((sum, value) => sum + value, 0)
  const waiverType = String(league.waiverSettings.type ?? "FAAB")
  const draft = league.draftSettings
  const draftDate = new Date(String(draft.scheduledDate ?? ""))

  return (
    <div className="space-y-3 p-4">
      <div className="rounded-xl border border-[#1c2c48] bg-gradient-to-br from-[#12203a] to-[#0d1424] p-3.5">
        <p className="text-xs font-black uppercase tracking-wider text-[#5e7090]">Signed in as</p>
        <div className="mt-1 flex items-center justify-between gap-2"><p className="truncate text-sm font-black text-white">{teamName}</p>{isCommissioner && <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-black uppercase text-amber-300"><Crown className="size-3" />Commissioner</span>}</div>
        <p className="text-xs text-[#8ba0c7]">@{managerHandle ?? "manager"}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[["Rank", rank > 0 ? `#${rank}` : "-"], ["FAAB", `$${faab ?? 0}`], ["Waiver", waiverPriority ? `#${waiverPriority}` : "-"]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#0a1120] py-2"><p className="text-sm font-black tabular-nums text-[#19ffff]">{value}</p><p className="text-xs font-bold uppercase text-[#5e7090]">{label}</p></div>)}
        </div>
      </div>

      <section className="rounded-xl border border-[#172338] bg-[#0f1829] p-3">
        <button type="button" aria-expanded={pinOpen} onClick={() => setPinOpen((open) => !open)} className="flex w-full items-center justify-between text-left">
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#5e7090]"><LockKeyhole className="size-3.5" />Change PIN</span>
          <ChevronRight className={cn("size-4 text-[#5e7090] transition", pinOpen && "rotate-90")} />
        </button>
        {pinOpen && (
          <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); void changePin() }}>
            {([["current-pin", "Current PIN", currentPin, setCurrentPin, "current-password"], ["new-pin", "New PIN", newPin, setNewPin, "new-password"], ["confirm-pin", "Confirm PIN", confirmPin, setConfirmPin, "new-password"]] as const).map(([id, label, value, setValue, autoComplete]) => (
              <label key={id} htmlFor={id} className="block text-xs font-bold text-[#8ba0c7]">{label}
                <input id={id} type="password" inputMode="numeric" autoComplete={autoComplete} maxLength={4} pattern="[0-9]{4}" value={value} disabled={pinBusy} onChange={(event) => { setValue(pinDigits(event.target.value)); setPinStatus(null) }} className="mt-1 w-full rounded-lg border border-[#263858] bg-[#0a1120] px-3 py-2 text-sm font-bold tracking-[0.3em] text-white outline-none focus:border-[#19ffff] disabled:opacity-50" />
              </label>
            ))}
            <button type="submit" disabled={pinBusy} className="w-full rounded-lg bg-[#19ffff]/15 py-2 text-xs font-black text-[#19ffff] transition hover:bg-[#19ffff]/25 disabled:opacity-50">Update PIN</button>
            {pinStatus && <p role="status" className={cn("text-xs font-bold", pinStatus.ok ? "text-emerald-400" : "text-rose-400")}>{pinStatus.text}</p>}
          </form>
        )}
      </section>

      {isCommissioner && (
        <section className="space-y-2 rounded-xl border border-amber-500/30 bg-[#161a29] p-3">
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-400"><Shield className="size-3.5" />Commissioner tools</h3>
          <button type="button" onClick={() => setRulebookOpen(true)} className="flex w-full items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"><span>Open Commissioner Rulebook &amp; Settings</span><ChevronRight className="size-4" /></button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy !== null} onClick={() => void run("/api/cron/sync", "NHL score sync")} className="flex items-center justify-center gap-1.5 rounded-xl border border-[#263858] bg-[#0d1424] py-2.5 text-xs font-bold text-[#8ba0c7] transition hover:text-white disabled:opacity-50"><RefreshCw className={cn("size-3.5", busy === "NHL score sync" && "animate-spin")} />Force NHL sync</button>
            <button type="button" disabled={busy !== null} onClick={() => void run("/api/cron/waivers", "Waiver processing")} className="flex items-center justify-center gap-1.5 rounded-xl border border-[#263858] bg-[#0d1424] py-2.5 text-xs font-bold text-[#8ba0c7] transition hover:text-white disabled:opacity-50"><Swords className="size-3.5" />Run waivers</button>
          </div>
          <div className="border-t border-amber-500/20 pt-2">
            <p className="mb-1 text-xs font-black uppercase text-amber-300">Co-commissioners</p>
            {managers.length === 0 && <p className="text-xs text-[#5e7090]">Loading managers...</p>}
            <ul className="divide-y divide-[#1f2638]">
              {managers.map((manager) => {
                const self = manager.handle === managerHandle
                return (
                  <li key={manager.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate text-xs text-white">@{manager.handle}{manager.isCommissioner && <Crown className="ml-1 inline size-3 text-amber-400" aria-label="Commissioner" />}</span>
                    <button type="button" disabled={self || busy === manager.id} onClick={() => void setRole(manager, !manager.isCommissioner)} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-black transition disabled:opacity-40", manager.isCommissioner ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300")}>{self ? "You" : manager.isCommissioner ? "Revoke" : "Grant"}</button>
                  </li>
                )
              })}
            </ul>
          </div>
          {status && <p role="status" className={cn("text-xs font-bold", status.ok ? "text-emerald-400" : "text-rose-400")}>{status.text}</p>}
        </section>
      )}

      <div className={cn("space-y-3 transition-opacity", !loaded && "opacity-60")}>
        <Card title="Roster">
          <Row label="Starting lineup" value={["C", "W", "F", "D", "G"].map((key) => `${positions[key] ?? 0} ${key}`).join(" / ")} />
          <Row label="Bench" value={positions.BN ?? 0} />
          <Row label="Roster size" value={capacity} />
          <Row label="Taxi squad" value={`${league.taxiSlots} spots, under ${league.taxiMaxGames} NHL GP`} />
          <Row label="Lineup lock" value={league.lineupLockMode === "DAILY" ? "Daily, per player game" : "Weekly, first game of week"} />
          <Row label="Injured reserve" value={`${league.irSlots} (pure IR only)`} />
        </Card>
        <Card title="Scoring">
          <div className="grid grid-cols-3 gap-1.5 py-2">
            {SCORING_LABELS.map(([key, label]) => <div key={key} className="rounded-lg bg-[#0a1120] px-2 py-1.5 text-center"><p className={cn("text-xs font-black tabular-nums", Number(league.scoringSettings[key] ?? 0) < 0 ? "text-rose-400" : Number(league.scoringSettings[key] ?? 0) === 0 ? "text-[#5e7090]" : "text-[#19ffff]")}>{Number(league.scoringSettings[key] ?? 0)}</p><p className="text-xs font-bold text-[#5e7090]">{label}</p></div>)}
          </div>
        </Card>
        <Card title="Waivers & trades">
          <Row label="Waiver system" value={waiverType === "FAAB" ? `FAAB, $${String(league.waiverSettings.faabBudget ?? 100)} budget` : "Rolling priority"} />
          <Row label="Waiver hold" value={`${String(league.waiverSettings.holdHours ?? 48)}h`} />
          <Row label="Waiver run" value="Monday midnight, after the final game" />
          <Row label="Trade review" value={String(league.tradeSettings.reviewType) === "VOTE" ? "League vote" : "Commissioner"} />
          <Row label="Trade deadline" value={`Week ${String(league.tradeSettings.deadlineWeek ?? 18)}`} />
          <Row label="Pick trading" value={league.tradeSettings.allowPickTrading === false ? "Off" : "On"} />
        </Card>
        <Card title="Draft">
          <Row label="Type" value={String(draft.type ?? "LINEAR")} />
          <Row label="Rounds" value={String(draft.rounds ?? 5)} />
          <Row label="Order" value={String(draft.orderType ?? "REVERSE_STANDINGS") === "LOTTERY" ? "Lottery" : "Reverse standings"} />
          <Row label="Scheduled" value={Number.isNaN(draftDate.getTime()) ? "TBD" : draftDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} />
        </Card>
        {!isCommissioner && <p className="rounded-lg border border-[#172338] bg-[#111c30] p-3 text-xs text-[#8ba0c7]">Rules are set by the league commissioner.</p>}
      </div>

      <button type="button" onClick={async () => { await fetch("/api/auth/session", { method: "DELETE" }); window.location.reload() }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 py-3 text-xs font-bold text-rose-400 transition hover:bg-rose-500/20 active:scale-95"><LogOut className="size-4" />Switch Team / Log Out</button>
      {isCommissioner && <CommissionerSettingsDialog open={rulebookOpen} onOpenChange={setRulebookOpen} />}
    </div>
  )
}
