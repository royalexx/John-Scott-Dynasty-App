"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export type PlayerGridViewType = "Projections" | "Stats" | "ADP"
export type PlayerGridPeriod = "Last 7 Days" | "Last 14 Days" | "Last 30 Days" | "Season Totals" | "Season Avg / Per Game" | "This Week" | "Next 14 Days" | "Rest of Season (ROS)"

export interface PlayerGridSettings {
  viewType: PlayerGridViewType
  period: PlayerGridPeriod
  year: string
}

export function PlayerGridSettingsDialog({
  open,
  settings,
  onOpenChange,
  onApply,
}: {
  open: boolean
  settings: PlayerGridSettings
  onOpenChange: (open: boolean) => void
  onApply: (settings: PlayerGridSettings) => void
}) {
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [settings, open])
  const viewTypes: PlayerGridViewType[] = ["Projections", "Stats", "ADP"]
  const backwardPeriods: PlayerGridPeriod[] = ["Last 7 Days", "Last 14 Days", "Last 30 Days", "Season Totals", "Season Avg / Per Game"]
  const forwardPeriods: PlayerGridPeriod[] = ["This Week", "Next 14 Days", "Rest of Season (ROS)"]
  const periods = draft.viewType === "Projections" ? forwardPeriods : backwardPeriods
  useEffect(() => {
    const valid = periods.includes(draft.period)
    if (!valid) setDraft({ ...draft, period: draft.viewType === "Projections" ? "Next 14 Days" : "Last 14 Days" })
  }, [draft.viewType, draft.period, periods])
  const years = ["2026", "2025", "2024", "2023"]
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-[430px] rounded-t-2xl border-t border-[#1a263d] bg-[#0d1424] p-4 text-white">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#5e7090]" />
        <div className="flex items-start justify-between">
          <div><h2 className="text-lg font-black">Player Grid Settings</h2><p className="mt-1 text-xs text-[#5e7090]">Select week/season and stat type</p></div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close player grid settings" className="rounded-full p-2 text-[#8ba0c7] hover:bg-[#172338]"><X className="size-5" /></button>
        </div>
        <div className="mt-5 space-y-4">
          {[
            ["VIEW TYPE", viewTypes, draft.viewType, (value: string) => setDraft({ ...draft, viewType: value as PlayerGridViewType })],
            ["TIME HORIZON", periods, draft.period, (value: string) => setDraft({ ...draft, period: value as PlayerGridPeriod })],
            ["YEAR", years, draft.year, (value: string) => setDraft({ ...draft, year: value })],
          ].map(([label, options, active, select]) => (
            <div key={label as string}>
              <p className="mb-2 text-xs font-black tracking-wider text-[#5e7090]">{label as string}</p>
              <div className="flex flex-wrap gap-2">
                {(options as string[]).map((option) => <button key={option} type="button" onClick={() => (select as (value: string) => void)(option)} className={cn("rounded-full px-3 py-1.5 text-xs font-black transition-all duration-150 active:scale-95", option === active ? "cursor-pointer bg-[#19ffff] text-[#080c14] hover:brightness-110 hover:shadow-[0_0_10px_rgba(25,255,255,0.35)]" : "cursor-pointer border border-[#1b2842] bg-[#101829] text-white hover:bg-[#16233b] hover:border-[#2a3f66]")}>{option}</button>)}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => { onApply(draft); onOpenChange(false) }} className="mt-6 h-11 w-full cursor-pointer rounded-full bg-[#19ffff] text-sm font-black uppercase tracking-wider text-[#080c14] transition-all duration-150 hover:brightness-110 hover:shadow-[0_0_16px_rgba(25,255,255,0.4)] active:scale-[0.98]">Done</button>
      </SheetContent>
    </Sheet>
  )
}
