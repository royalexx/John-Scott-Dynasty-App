"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Minus, Plus, RotateCcw, Save } from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { TAXI_MAX_NHL_GAMES } from "@/lib/hockey-data"
import { cn } from "@/lib/utils"

export type LeagueSettings = {
  rosterPositions: Record<string, number>
  scoringSettings: Record<string, unknown>
  waiverSettings: Record<string, unknown>
  tradeSettings: Record<string, unknown>
  draftSettings: Record<string, unknown>
  taxiSlots: number
  taxiMaxGames: number
  irSlots: number
  currentWeek: number
  lineupLockMode: "WEEKLY" | "DAILY"
}

export const defaultLeagueSettings: LeagueSettings = {
  rosterPositions: { C: 3, W: 6, F: 3, D: 6, G: 2, BN: 7 },
  scoringSettings: { goal: 3, assist: 2, shot: 0.2, hit: 0.2, block: 0.2, ppp: 0, shg: 0, gwg: 0, plusMinus: 0, win: 4, save: 0.2, goalsAgainst: -1, shutout: 3, overtimeLoss: 0 },
  waiverSettings: { type: "FAAB", faabBudget: 100, minBid: 0, holdHours: 48 },
  tradeSettings: { reviewType: "COMMISSIONER", reviewHours: 24, deadlineWeek: 18, allowPickTrading: true },
  draftSettings: { type: "LINEAR", rounds: 5, timerSeconds: 120, scheduledDate: "2027-08-15T18:00:00Z", orderType: "REVERSE_STANDINGS" },
  taxiSlots: 2, taxiMaxGames: TAXI_MAX_NHL_GAMES, irSlots: 1, currentWeek: 1, lineupLockMode: "WEEKLY",
}

export function mergeLeagueSettings(base: LeagueSettings, data: Partial<LeagueSettings>): LeagueSettings {
  return {
    ...base,
    ...data,
    rosterPositions: { ...base.rosterPositions, ...data.rosterPositions },
    scoringSettings: { ...base.scoringSettings, ...data.scoringSettings },
    waiverSettings: { ...base.waiverSettings, ...data.waiverSettings },
    tradeSettings: { ...base.tradeSettings, ...data.tradeSettings },
    draftSettings: { ...base.draftSettings, ...data.draftSettings },
  }
}

function lockedRosterOrScoringChanged(previous: LeagueSettings, next: LeagueSettings) {
  const snapshot = (value: LeagueSettings) => ({
    rosterPositions: value.rosterPositions,
    scoringSettings: value.scoringSettings,
    taxiSlots: value.taxiSlots,
    taxiMaxGames: value.taxiMaxGames,
    irSlots: value.irSlots,
  })
  return JSON.stringify(snapshot(previous)) !== JSON.stringify(snapshot(next))
}

const tabs = ["Roster", "Scoring", "Waivers", "Trades", "Draft", "Tools"] as const
type Tab = typeof tabs[number]
type RecordField = "rosterPositions" | "scoringSettings" | "waiverSettings" | "tradeSettings" | "draftSettings"

const SLOT_LABELS: Record<string, string> = { C: "Center", W: "Winger", F: "Flex forward (C/W)", D: "Defense", G: "Goalie", BN: "Bench" }
const SKATER_SCORING: Array<[string, string]> = [["Goals", "goal"], ["Assists", "assist"], ["Shots on goal", "shot"], ["Hits", "hit"], ["Blocked shots", "block"], ["Power play points", "ppp"], ["Shorthanded goals", "shg"], ["Game-winning goals", "gwg"], ["Plus / minus", "plusMinus"]]
const GOALIE_SCORING: Array<[string, string]> = [["Wins", "win"], ["Saves", "save"], ["Goals against", "goalsAgainst"], ["Shutouts", "shutout"], ["OT losses", "overtimeLoss"]]

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="space-y-2"><div><h3 className="text-xs font-black uppercase tracking-wider text-amber-300">{title}</h3>{hint && <p className="text-xs text-[#5e7090]">{hint}</p>}</div>{children}</section>
}

function Stepper({ label, hint, value, onChange, min = 0, max = 999, step = 1, disabled = false }: { label: string; hint?: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next * 100) / 100))
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-xl border border-[#1c2c48] bg-[#0a1120] px-3 py-2", disabled && "opacity-50")}>
      <div className="min-w-0"><p className="truncate text-xs font-bold text-white">{label}</p>{hint && <p className="truncate text-xs text-[#5e7090]">{hint}</p>}</div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))} disabled={disabled || value <= min} className="flex size-7 items-center justify-center rounded-full bg-[#172338] text-[#8ba0c7] transition active:scale-90 disabled:opacity-30"><Minus className="size-3.5" /></button>
        <input aria-label={label} type="number" inputMode="decimal" step={step} disabled={disabled} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(clamp(Number(event.target.value)))} className="w-14 rounded-md bg-transparent py-1 text-center text-sm font-black tabular-nums text-[#19ffff] outline-none focus:bg-[#172338] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none disabled:cursor-not-allowed" />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))} disabled={disabled || value >= max} className="flex size-7 items-center justify-center rounded-full bg-[#172338] text-[#8ba0c7] transition active:scale-90 disabled:opacity-30"><Plus className="size-3.5" /></button>
      </div>
    </div>
  )
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="rounded-xl border border-[#1c2c48] bg-[#0a1120] p-2">
      <p className="px-1 pb-1.5 text-xs font-bold text-white">{label}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)} className={cn("flex-1 rounded-lg px-2 py-2 text-xs font-black transition", value === option.value ? "bg-amber-400 text-[#080c14]" : "bg-[#172338] text-[#8ba0c7] hover:text-white")}>{option.label}</button>)}
      </div>
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#1c2c48] bg-[#0a1120] px-3 py-2.5 text-left">
      <span><span className="block text-xs font-bold text-white">{label}</span>{hint && <span className="block text-xs text-[#5e7090]">{hint}</span>}</span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-amber-400" : "bg-[#263858]")}><span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", checked ? "left-[18px]" : "left-0.5")} /></span>
    </button>
  )
}

function toLocalInput(value: unknown) {
  const date = new Date(String(value ?? ""))
  if (Number.isNaN(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function CommissionerSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [tab, setTab] = useState<Tab>("Roster")
  const [settings, setSettings] = useState<LeagueSettings>(defaultLeagueSettings)
  const [saved, setSaved] = useState<LeagueSettings>(defaultLeagueSettings)
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "error"; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [structureLocked, setStructureLocked] = useState(false)

  const update = (patch: Partial<LeagueSettings>) => setSettings((current) => ({ ...current, ...patch }))
  const updateRecord = (field: RecordField, key: string, value: unknown) =>
    setSettings((current) => ({ ...current, [field]: { ...current[field], [key]: value } }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/league-settings", { cache: "no-store" })
      if (!response.ok) throw new Error(`Load failed (${response.status})`)
      const payload = await response.json() as Partial<LeagueSettings> & { structureLocked?: boolean }
      setStructureLocked(payload.structureLocked === true)
      const merged = mergeLeagueSettings(defaultLeagueSettings, payload)
      setSettings(merged)
      setSaved(merged)
      setStatus(null)
    } catch (error: unknown) {
      console.error("Failed to load commissioner settings", error)
      setStatus({ tone: "error", text: "Unable to load settings. Showing defaults." })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(saved), [settings, saved])
  const capacity = Object.values(settings.rosterPositions).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const starters = ["C", "W", "F", "D", "G"].reduce((sum, key) => sum + (settings.rosterPositions[key] ?? 0), 0)
  const problems: string[] = []
  if ((settings.rosterPositions.G ?? 0) < 1) problems.push("At least one goalie slot is required.")
  if (starters < 1) problems.push("At least one starting slot is required.")
  if (settings.draftSettings.scheduledDate && Number.isNaN(new Date(String(settings.draftSettings.scheduledDate)).getTime())) problems.push("Draft date is invalid.")

  const save = async () => {
    if (problems.length > 0) { setStatus({ tone: "error", text: problems[0] }); return }
    setSaving(true)
    setStatus({ tone: "info", text: "Saving..." })
    try {
      const { rosterPositions, scoringSettings, waiverSettings, tradeSettings, draftSettings, taxiSlots, taxiMaxGames, irSlots, lineupLockMode } = settings
      const response = await fetch("/api/admin/league-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterPositions, scoringSettings, waiverSettings, tradeSettings, draftSettings, taxiSlots, taxiMaxGames, irSlots, lineupLockMode }) })
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: string } | null
        setStatus({ tone: "error", text: response.status === 403 ? "Only commissioners can save settings." : failure?.error ?? `Save failed (${response.status}).` })
        setSaving(false)
        return
      }
      const payload = await response.json() as Partial<LeagueSettings> & { structureLocked?: boolean }
      const locked = payload.structureLocked === true
      const rejectedLockedEdits = locked && lockedRosterOrScoringChanged(saved, settings)
      setStructureLocked(locked)
      const merged = mergeLeagueSettings(defaultLeagueSettings, payload)
      setSettings(merged)
      setSaved(merged)
      if (rejectedLockedEdits) {
        setStatus({ tone: "info", text: "Week 1 has already started, so only unlocked settings (lock mode, waivers, trades, draft) were persisted. Roster shape and scoring were left unchanged." })
        setSaving(false)
        return
      }
      setStatus({ tone: "ok", text: "Saved. Applying the new rules..." })
      // Server components hydrate slots/rules, so a reload applies them everywhere at once.
      window.setTimeout(() => window.location.reload(), 600)
    } catch (error: unknown) {
      console.error("Failed to save commissioner settings", error)
      setStatus({ tone: "error", text: "Save failed (network error)." })
      setSaving(false)
    }
  }

  const runAction = async (endpoint: string, label: string) => {
    setStatus({ tone: "info", text: `${label}...` })
    try {
      const response = await fetch(endpoint, { method: "POST" })
      const data = await response.json().catch(() => null) as { message?: string } | null
      setStatus(response.ok ? { tone: "ok", text: data?.message ?? `${label} complete.` } : { tone: "error", text: `${label} failed (${response.status}).` })
    } catch {
      setStatus({ tone: "error", text: `${label} failed (network error).` })
    }
  }

  const scoring = settings.scoringSettings
  const waiverType = String(settings.waiverSettings.type ?? "FAAB")
  const draft = settings.draftSettings

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" spring="gentle" className="mx-auto flex data-[side=bottom]:h-[88dvh] max-w-[430px] flex-col gap-0 overflow-hidden rounded-t-2xl border-t border-amber-500/30 bg-[#0d1424] p-0 text-white">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#5e7090]" />
        <div className="flex shrink-0 items-start justify-between border-b border-[#172338] px-4 py-3">
          <div><h2 className="text-lg font-black">Commissioner Rulebook</h2><p className="text-xs text-[#8ba0c7]">League-wide rules. Changes apply to every team.</p></div>
          {dirty && <span className="rounded-full bg-amber-400/15 px-2 py-1 text-xs font-black uppercase text-amber-300">Unsaved</span>}
        </div>
        <div role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#172338] p-2">
          {tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} type="button" onClick={() => setTab(item)} className={cn("shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition", tab === item ? "bg-amber-400 text-[#080c14]" : "bg-[#172338] text-[#8ba0c7] hover:text-white")}>{item}</button>)}
        </div>

        <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto p-4", loading && "pointer-events-none opacity-60")}>
          {tab === "Roster" && <>
            {structureLocked && <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">Roster shape and scoring locked after week 1. Waiver hold, the trade deadline, and pick trading can still change.</p>}
            <Section title="Lineup slots" hint="Starters score every week; bench players do not.">
              {["C", "W", "F", "D", "G", "BN"].map((key) => <Stepper key={key} label={key} hint={SLOT_LABELS[key]} value={settings.rosterPositions[key] ?? 0} max={20} onChange={(value) => updateRecord("rosterPositions", key, value)} />)}
            </Section>
            <Section title="Lineup lock" hint="Decides when starting slots (C/W/F/D/G) freeze. Bench, IR and taxi stay movable.">
              <Segmented label="Lock starters" value={settings.lineupLockMode} options={[{ value: "WEEKLY", label: "Weekly (first game)" }, { value: "DAILY", label: "Daily (each game)" }]} onChange={(value) => update({ lineupLockMode: value })} />
              <p className="px-1 text-xs text-[#5e7090]">{settings.lineupLockMode === "WEEKLY" ? "Starters lock when the first NHL game of the fantasy week begins and unlock Monday." : "A player locks only once their own team's game today has started."}</p>
            </Section>
            <Section title="Reserve spots" hint="IR is pure IR only (DTD / IR+ are not eligible).">
              <Stepper label="Taxi squad slots" value={settings.taxiSlots} max={10} onChange={(value) => update({ taxiSlots: value })} />
              <Stepper label="Taxi NHL games cap" hint="Eligible while career NHL GP is below this" value={settings.taxiMaxGames} max={400} step={5} onChange={(value) => update({ taxiMaxGames: value })} />
              <Stepper label="IR slots" value={settings.irSlots} max={10} onChange={(value) => update({ irSlots: value })} />
            </Section>
            <div className="rounded-xl bg-[#172338] p-3 text-xs"><p className="font-black text-[#19ffff]">Roster capacity: {capacity}</p><p className="mt-0.5 text-xs text-[#8ba0c7]">{starters} starters + {settings.rosterPositions.BN ?? 0} bench. Waiver drops are optional while a team is below {capacity}.</p></div>
          </>}

          {tab === "Scoring" && <>
            {structureLocked && <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">Scoring locked after week 1 so finished weeks keep the weights they were played under.</p>}
            <Section title="Skaters">{SKATER_SCORING.map(([label, key]) => <Stepper key={key} label={label} value={Number(scoring[key] ?? 0)} min={-20} max={50} step={0.1} onChange={(value) => updateRecord("scoringSettings", key, value)} />)}</Section>
            <Section title="Goalies">{GOALIE_SCORING.map(([label, key]) => <Stepper key={key} label={label} value={Number(scoring[key] ?? 0)} min={-20} max={50} step={0.1} onChange={(value) => updateRecord("scoringSettings", key, value)} />)}</Section>
            <button type="button" disabled={structureLocked} onClick={() => update({ scoringSettings: { ...defaultLeagueSettings.scoringSettings } })} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#263858] py-2.5 text-xs font-bold text-[#8ba0c7] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="size-3.5" />Reset scoring to default</button>
          </>}

          {tab === "Waivers" && <>
            <Segmented label="Waiver system" value={waiverType} options={[{ value: "FAAB", label: "FAAB bidding" }, { value: "ROLLING", label: "Rolling priority" }]} onChange={(value) => updateRecord("waiverSettings", "type", value)} />
            {waiverType === "FAAB" && <><Stepper label="FAAB budget" hint="Per team, per season" value={Number(settings.waiverSettings.faabBudget ?? 100)} max={10000} step={5} onChange={(value) => updateRecord("waiverSettings", "faabBudget", value)} /><Stepper label="Minimum bid" value={Number(settings.waiverSettings.minBid ?? 0)} max={1000} onChange={(value) => updateRecord("waiverSettings", "minBid", value)} /></>}
            <Stepper label="Waiver hold (hours)" hint="Dropped players stay on waivers this long" value={Number(settings.waiverSettings.holdHours ?? 48)} max={168} step={6} onChange={(value) => updateRecord("waiverSettings", "holdHours", value)} />
          </>}

          {tab === "Trades" && <>
            <Segmented label="Trade review" value={String(settings.tradeSettings.reviewType ?? "COMMISSIONER")} options={[{ value: "COMMISSIONER", label: "Commissioner" }, { value: "VOTE", label: "League vote" }]} onChange={(value) => updateRecord("tradeSettings", "reviewType", value)} />
            <Stepper label="Review window (hours)" value={Number(settings.tradeSettings.reviewHours ?? 24)} max={168} step={6} onChange={(value) => updateRecord("tradeSettings", "reviewHours", value)} />
            <Stepper label="Trade deadline (week)" value={Number(settings.tradeSettings.deadlineWeek ?? 18)} max={30} onChange={(value) => updateRecord("tradeSettings", "deadlineWeek", value)} />
            <Toggle label="Allow draft pick trading" hint="Future rookie picks can be included in offers" checked={settings.tradeSettings.allowPickTrading !== false} onChange={(value) => updateRecord("tradeSettings", "allowPickTrading", value)} />
          </>}

          {tab === "Draft" && <>
            <Segmented label="Draft type" value={String(draft.type ?? "LINEAR")} options={[{ value: "LINEAR", label: "Rookie" }, { value: "SNAKE", label: "Snake" }, { value: "AUCTION", label: "Auction" }]} onChange={(value) => updateRecord("draftSettings", "type", value)} />
            <Stepper label="Rounds" value={Number(draft.rounds ?? 5)} min={1} max={30} onChange={(value) => updateRecord("draftSettings", "rounds", value)} />
            <label className="block rounded-xl border border-[#1c2c48] bg-[#0a1120] p-3 text-xs font-bold text-white">Pick timer
              <select value={String(draft.timerSeconds ?? 120)} onChange={(event) => updateRecord("draftSettings", "timerSeconds", Number(event.target.value))} className="mt-1.5 w-full rounded-lg bg-[#172338] p-2 text-xs font-normal text-white outline-none">
                <option value="60">60 seconds</option><option value="90">90 seconds</option><option value="120">120 seconds</option><option value="28800">Slow draft (8h)</option><option value="86400">Slow draft (24h)</option>
              </select>
            </label>
            <label className="block rounded-xl border border-[#1c2c48] bg-[#0a1120] p-3 text-xs font-bold text-white">Draft date &amp; time
              <input type="datetime-local" value={toLocalInput(draft.scheduledDate)} onChange={(event) => { const next = new Date(event.target.value); if (!Number.isNaN(next.getTime())) updateRecord("draftSettings", "scheduledDate", next.toISOString()) }} className="mt-1.5 w-full rounded-lg bg-[#172338] p-2 text-xs font-normal text-white outline-none [color-scheme:dark]" />
            </label>
            <Segmented label="Draft order" value={String(draft.orderType ?? "REVERSE_STANDINGS")} options={[{ value: "REVERSE_STANDINGS", label: "Reverse standings" }, { value: "LOTTERY", label: "Lottery" }]} onChange={(value) => updateRecord("draftSettings", "orderType", value)} />
          </>}

          {tab === "Tools" && <>
            <Section title="Season calendar" hint={`Weeks run Monday to Sunday and follow the NHL schedule automatically (week ${settings.currentWeek} now).`}>
              <div className="rounded-xl bg-[#172338] p-3 text-xs text-[#8ba0c7]">The league week advances every Monday. Scores for finished weeks are recalculated from NHL boxscores on every sync.</div>
            </Section>
            <Section title="Manual jobs">
              <button type="button" onClick={() => void runAction("/api/cron/sync", "NHL stats sync")} className="w-full rounded-xl border border-[#263858] bg-[#172338] p-3 text-left text-xs font-bold hover:border-amber-400/50">Force NHL stats sync<span className="block text-xs font-normal text-[#5e7090]">Pull the latest scores, boxscores and injuries</span></button>
              <button type="button" onClick={() => void runAction("/api/cron/waivers", "Waiver run")} className="w-full rounded-xl border border-[#263858] bg-[#172338] p-3 text-left text-xs font-bold hover:border-amber-400/50">Run weekly waivers<span className="block text-xs font-normal text-[#5e7090]">Processes pending claims Monday at midnight, after the final game of the week</span></button>
            </Section>
          </>}
        </div>

        <div className="shrink-0 space-y-2 border-t border-[#172338] bg-[#0d1424] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {status && <p role="status" className={cn("text-xs font-bold", status.tone === "error" ? "text-rose-400" : status.tone === "ok" ? "text-emerald-400" : "text-[#8ba0c7]")}>{status.text}</p>}
          {!status && problems.length > 0 && <p role="status" className="text-xs font-bold text-rose-400">{problems[0]}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={!dirty || saving} onClick={() => { setSettings(saved); setStatus(null) }} className="flex items-center justify-center gap-1.5 rounded-full border border-[#263858] px-4 py-2.5 text-xs font-bold text-[#8ba0c7] transition enabled:hover:text-white disabled:opacity-30"><RotateCcw className="size-3.5" />Discard</button>
            <button type="button" disabled={!dirty || saving || problems.length > 0} onClick={() => void save()} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-amber-400 py-2.5 text-xs font-black text-[#080c14] transition active:scale-[0.98] disabled:opacity-40">{status?.tone === "ok" ? <Check className="size-4" /> : <Save className="size-4" />}Save Rulebook Settings</button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
