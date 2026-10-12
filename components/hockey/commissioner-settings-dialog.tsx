"use client"

import { useEffect, useState } from "react"
import { Sheet, SheetContent } from "@/components/ui/sheet"

type Settings = {
  rosterPositions: Record<string, number>
  scoringSettings: Record<string, unknown>
  waiverSettings: Record<string, unknown>
  tradeSettings: Record<string, unknown>
  draftSettings: Record<string, unknown>
  taxiSlots: number
  taxiMaxGames: number
  irSlots: number
  currentWeek: number
}

const defaults: Settings = {
  rosterPositions: { C: 3, W: 6, F: 3, D: 6, G: 2, BN: 7 },
  scoringSettings: { goal: 3, assist: 2, shot: 0.2, hit: 0.2, block: 0.2, ppp: 0, shg: 0, gwg: 0, plusMinus: 0, win: 4, save: 0.2, goalsAgainst: -1, shutout: 3, overtimeLoss: 0 },
  waiverSettings: { type: "FAAB", faabBudget: 100, minBid: 0, holdHours: 48 },
  tradeSettings: { reviewType: "COMMISSIONER", reviewHours: 24, deadlineWeek: 18, allowPickTrading: true },
  draftSettings: { type: "LINEAR", rounds: 5, timerSeconds: 120, scheduledDate: "2027-08-15T18:00:00Z", orderType: "REVERSE_STANDINGS" },
  taxiSlots: 2, taxiMaxGames: 160, irSlots: 1, currentWeek: 1,
}

const tabs = ["Roster", "Scoring", "Waivers & Trades", "Draft", "Manual"] as const
type Tab = typeof tabs[number]

function numberField(label: string, value: number, onChange: (value: number) => void) {
  return <label className="flex items-center justify-between gap-3 rounded-lg border border-[#263858] bg-[#0d1424] px-3 py-2 text-xs text-[#8ba0c7]"><span>{label}</span><input type="number" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-20 rounded bg-[#172338] px-2 py-1 text-right text-white outline-none focus:ring-1 focus:ring-[#19ffff]" /></label>
}

export function CommissionerSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [tab, setTab] = useState<Tab>("Roster")
  const [settings, setSettings] = useState<Settings>(defaults)
  const [status, setStatus] = useState<string | null>(null)
  const update = (patch: Partial<Settings>) => setSettings((current) => ({ ...current, ...patch }))
  const updateRecord = (field: keyof Pick<Settings, "rosterPositions" | "scoringSettings" | "waiverSettings" | "tradeSettings" | "draftSettings">, key: string, value: unknown) =>
    setSettings((current) => ({ ...current, [field]: { ...current[field], [key]: value } }))

  useEffect(() => {
    if (!open) return
    fetch("/api/admin/league-settings", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<Partial<Settings>> : Promise.reject(new Error(`Load failed (${response.status})`)))
      .then((data) => setSettings((current) => ({ ...current, ...data, rosterPositions: { ...current.rosterPositions, ...data.rosterPositions }, scoringSettings: { ...current.scoringSettings, ...data.scoringSettings }, waiverSettings: { ...current.waiverSettings, ...data.waiverSettings }, tradeSettings: { ...current.tradeSettings, ...data.tradeSettings }, draftSettings: { ...current.draftSettings, ...data.draftSettings } })))
      .catch((error: unknown) => { console.error("Failed to load commissioner settings", error); setStatus("Unable to load settings") })
  }, [open])

  const save = async () => {
    setStatus("Saving...")
    const response = await fetch("/api/admin/league-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) })
    if (!response.ok) { setStatus(`Save failed (${response.status})`); return }
    setStatus("Saved")
    window.setTimeout(() => window.location.reload(), 700)
  }
  const action = async (endpoint: string, label: string) => {
    setStatus(`${label}...`)
    const response = await fetch(endpoint, { method: "POST" })
    setStatus(response.ok ? `${label} complete` : `${label} failed (${response.status})`)
  }

  const scoring = settings.scoringSettings
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="bottom" className="mx-auto max-h-[90vh] max-w-[430px] overflow-y-auto rounded-t-2xl border-t border-amber-500/30 bg-[#0d1424] p-0 text-white">
    <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#5e7090]" />
    <div className="border-b border-[#172338] px-4 py-3"><h2 className="text-lg font-black">Commissioner Rulebook</h2><p className="text-[10px] text-[#8ba0c7]">League-wide settings</p></div>
    <div className="flex gap-1 overflow-x-auto border-b border-[#172338] p-2">{tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-bold ${tab === item ? "bg-amber-400 text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]"}`}>{item}</button>)}</div>
    <div className="space-y-2 p-4">
      {tab === "Roster" && <><p className="text-[10px] font-black uppercase text-amber-300">Starting slots</p>{["C", "W", "F", "D", "G", "BN"].map((key) => numberField(key, settings.rosterPositions[key] ?? 0, (value) => updateRecord("rosterPositions", key, value)))}{numberField("Taxi Squad slots", settings.taxiSlots, (value) => update({ taxiSlots: value }))}{numberField("Taxi max NHL games", settings.taxiMaxGames, (value) => update({ taxiMaxGames: value }))}<p className="text-[10px] text-[#8ba0c7]">IR slots: {settings.irSlots} (Pure IR only; DTD/IR+ ineligible)</p><p className="rounded-lg bg-[#172338] p-3 text-xs font-bold text-[#19ffff]">Total roster capacity: {Object.values(settings.rosterPositions).reduce((sum, value) => sum + value, 0) + settings.taxiSlots + settings.irSlots}</p></>}
      {tab === "Scoring" && <>{[["Goals", "goal"], ["Assists", "assist"], ["Shots (SOG)", "shot"], ["Hits", "hit"], ["Blocks", "block"], ["Power Play Points", "ppp"], ["Shorthanded Goals", "shg"], ["Game Winning Goals", "gwg"], ["Plus / Minus", "plusMinus"], ["Goalie Wins", "win"], ["Saves", "save"], ["Goals Against", "goalsAgainst"], ["Shutouts", "shutout"], ["OT Losses", "overtimeLoss"]].map(([label, key]) => numberField(label, Number(scoring[key] ?? 0), (value) => updateRecord("scoringSettings", key, value)))}</>}
      {tab === "Waivers & Trades" && <><select value={String(settings.waiverSettings.type)} onChange={(event) => updateRecord("waiverSettings", "type", event.target.value)} className="w-full rounded-lg bg-[#172338] p-2 text-xs text-white"><option value="FAAB">FAAB</option><option value="ROLLING">Rolling Priority</option></select>{numberField("FAAB budget", Number(settings.waiverSettings.faabBudget ?? 100), (value) => updateRecord("waiverSettings", "faabBudget", value))}{numberField("Minimum bid", Number(settings.waiverSettings.minBid ?? 0), (value) => updateRecord("waiverSettings", "minBid", value))}{numberField("Hold hours", Number(settings.waiverSettings.holdHours ?? 48), (value) => updateRecord("waiverSettings", "holdHours", value))}<select value={String(settings.tradeSettings.reviewType)} onChange={(event) => updateRecord("tradeSettings", "reviewType", event.target.value)} className="w-full rounded-lg bg-[#172338] p-2 text-xs text-white"><option value="COMMISSIONER">Commissioner Approval</option><option value="VOTE">League Vote</option></select>{numberField("Trade review hours", Number(settings.tradeSettings.reviewHours ?? 24), (value) => updateRecord("tradeSettings", "reviewHours", value))}{numberField("Trade deadline week", Number(settings.tradeSettings.deadlineWeek ?? 18), (value) => updateRecord("tradeSettings", "deadlineWeek", value))}</>}
      {tab === "Draft" && <><select value={String(settings.draftSettings.type)} onChange={(event) => updateRecord("draftSettings", "type", event.target.value)} className="w-full rounded-lg bg-[#172338] p-2 text-xs text-white"><option value="LINEAR">Rookie Draft (Linear)</option><option value="SNAKE">Startup Draft (Snake)</option><option value="AUCTION">Auction</option></select>{numberField("Rounds", Number(settings.draftSettings.rounds ?? 5), (value) => updateRecord("draftSettings", "rounds", value))}<select value={String(settings.draftSettings.timerSeconds)} onChange={(event) => updateRecord("draftSettings", "timerSeconds", Number(event.target.value))} className="w-full rounded-lg bg-[#172338] p-2 text-xs text-white"><option value="60">60 seconds</option><option value="90">90 seconds</option><option value="120">120 seconds</option><option value="28800">Slow draft (8h)</option><option value="86400">Slow draft (24h)</option></select><label className="text-xs text-[#8ba0c7]">Scheduled date<input type="datetime-local" value={String(settings.draftSettings.scheduledDate).replace("Z", "")} onChange={(event) => updateRecord("draftSettings", "scheduledDate", new Date(event.target.value).toISOString())} className="mt-1 w-full rounded bg-[#172338] p-2 text-white" /></label><select value={String(settings.draftSettings.orderType)} onChange={(event) => updateRecord("draftSettings", "orderType", event.target.value)} className="w-full rounded-lg bg-[#172338] p-2 text-xs text-white"><option value="REVERSE_STANDINGS">Reverse Regular Season Standings</option><option value="LOTTERY">Lottery</option></select></>}
      {tab === "Manual" && <><button type="button" onClick={() => void action("/api/cron/sync", "Stats sync")} className="w-full rounded-xl border border-[#263858] bg-[#172338] p-3 text-left text-xs font-bold">Force NHL Stats Sync</button><button type="button" onClick={() => void action("/api/cron/waivers", "Waivers")} className="w-full rounded-xl border border-[#263858] bg-[#172338] p-3 text-left text-xs font-bold">Run Waiver Claims Now</button><button type="button" onClick={() => update({ currentWeek: Math.min(24, settings.currentWeek + 1) })} className="w-full rounded-xl border border-[#263858] bg-[#172338] p-3 text-left text-xs font-bold">Advance League Week (currently {settings.currentWeek})</button></>}
      {status && <p role="status" className="text-xs text-[#8ba0c7]">{status}</p>}
      <button type="button" onClick={() => void save()} className="w-full rounded-full bg-amber-400 py-2.5 text-xs font-black text-[#080c14]">Save Rulebook Settings</button>
    </div>
  </SheetContent></Sheet>
}
