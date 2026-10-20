"use client"

import { useEffect, useMemo, useState } from "react"
import { SlidersHorizontal, X } from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { MarketPlayer } from "@/lib/hockey-data"

type DraftSlotView = {
  pickNumber: number
  round: number
  slot: number
  teamId: string
  teamName: string
  playerId: number | null
  playerName: string | null
  position: string | null
  nhlTeam: string | null
}

type DraftOrder = "LINEAR" | "SNAKE"

type DraftView = {
  id: string
  type: DraftOrder
  status: "SCHEDULED" | "LIVE" | "COMPLETE"
  rounds: number
  timerSeconds: number
  startAt: string
  paused: boolean
  remainingSeconds: number
  yourTurn: boolean
  onClockTeamId: string | null
  teams: { id: string; name: string; slot: number }[]
  queue: number[]
  slots: DraftSlotView[]
}

type DraftPayload = {
  scheduled: { startAt: string; rounds: number; timerSeconds: number; type: DraftOrder } | null
  draft: DraftView | null
}

const positionBar: Record<string, string> = {
  C: "bg-[#1d4ed8]",
  LW: "bg-[#0d9488]",
  RW: "bg-[#0d9488]",
  W: "bg-[#0d9488]",
  F: "bg-[#7c3aed]",
  D: "bg-[#b45309]",
  G: "bg-[#0284c7]",
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(" ")}`
}

function clockLabel(seconds: number) {
  const safe = Math.max(0, seconds)
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`
}

function whenLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))
}

export function DraftCard({ players, isCommissioner }: { players: MarketPlayer[]; isCommissioner: boolean }) {
  const [payload, setPayload] = useState<DraftPayload | null>(null)
  const [open, setOpen] = useState(false)
  const [receivedAt, setReceivedAt] = useState(Date.now())
  const [now, setNow] = useState(Date.now())

  const load = (ensure: boolean) => {
    const query = ensure ? "?ensure=1" : ""
    return fetch(`/api/draft${query}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<DraftPayload> : null)
      .then((next) => {
        if (!next) return
        setPayload(next)
        setReceivedAt(Date.now())
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    void load(false)
    const poll = setInterval(() => void load(open), open ? 3000 : 15000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [open])

  const scheduled = payload?.scheduled
  const draft = payload?.draft ?? null
  if (!scheduled && !draft) return null
  const live = draft?.status === "LIVE"
  const startAt = draft?.startAt ?? scheduled?.startAt
  const rounds = draft?.rounds ?? scheduled?.rounds ?? 0
  const draftType = draft?.type ?? scheduled?.type
  const elapsed = Math.floor((now - receivedAt) / 1000)
  const remaining = draft && live && !draft.paused ? Math.max(0, draft.remainingSeconds - elapsed) : draft?.remainingSeconds ?? 0

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#19ffff]/25 bg-[#0d1424] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(24,48,71,0.8)]">
        <div className="min-w-0">
          <p className="text-xs font-black tracking-[0.18em] text-[#19ffff]">DRAFT</p>
          {live ? (
            <p className="mt-1 flex items-center gap-2 text-sm font-bold text-white"><span className="size-2 animate-pulse rounded-full bg-[#ff3b6b]" />Draft is live</p>
          ) : draft?.status === "COMPLETE" ? (
            <p className="mt-1 text-sm font-bold text-white">Draft complete</p>
          ) : (
            <p className="mt-1 truncate text-sm font-bold text-white">{startAt ? whenLabel(startAt) : "Scheduled"}</p>
          )}
          <p className="text-xs text-[#8ba0c7]">{draftType === "LINEAR" ? "Linear" : "Snake"} · {rounds} rounds</p>
        </div>
        <button type="button" onClick={() => { setOpen(true); void load(true) }} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-bold", live ? "bg-[#19ffff] text-[#080c14]" : "border border-[#19ffff] text-[#19ffff]")}>Draft room</button>
      </div>
      <DraftRoom open={open} onOpenChange={setOpen} draft={draft} players={players} isCommissioner={isCommissioner} remaining={remaining} onChange={(next) => { setPayload((current) => ({ scheduled: current?.scheduled ?? null, draft: next })); setReceivedAt(Date.now()) }} />
    </>
  )
}

function DraftRoom({ open, onOpenChange, draft, players, isCommissioner, remaining, onChange }: { open: boolean; onOpenChange: (open: boolean) => void; draft: DraftView | null; players: MarketPlayer[]; isCommissioner: boolean; remaining: number; onChange: (draft: DraftView) => void }) {
  const [tab, setTab] = useState<"board" | "players" | "queue">("board")
  const [query, setQuery] = useState("")
  const [position, setPosition] = useState("ALL")
  const [armed, setArmed] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const act = async (body: { action: string; playerId?: number; timerSeconds?: number }) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const payload = await response.json() as { draft?: DraftView; error?: string }
      if (!response.ok || !payload.draft) {
        setError(payload.error ?? "Draft action failed")
        return
      }
      onChange(payload.draft)
      if (body.action === "pick") setArmed(null)
    } finally {
      setBusy(false)
    }
  }

  const drafted = useMemo(() => new Set((draft?.slots ?? []).map((slot) => slot.playerId).filter((id): id is number => id != null)), [draft])
  const current = draft?.slots?.find((slot) => slot.playerId == null) ?? null
  const round = current?.round ?? draft?.rounds ?? 1
  const roundSlots = (draft?.slots ?? []).filter((slot) => slot.round === round).sort((a, b) => a.pickNumber - b.pickNumber)
  const available = players.filter((player) => {
    if (player.nhlId == null || drafted.has(player.nhlId)) return false
    const matchesPosition = position === "ALL" || player.position === position || (position === "W" && (player.position === "LW" || player.position === "RW"))
    return matchesPosition && player.name.toLowerCase().includes(query.trim().toLowerCase())
  }).slice(0, 80)
  const queued = (draft?.queue ?? []).map((id) => players.find((player) => player.nhlId === id)).filter((player): player is MarketPlayer => player != null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" spring="snappy" className="relative mx-auto flex h-dvh max-h-dvh max-w-[430px] flex-col gap-0 rounded-none border-[#1a263d] bg-[#070a12] p-0 text-white">
        <header className="flex shrink-0 items-center justify-between border-b border-[#172338] px-2 py-2">
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-full px-3 py-2 text-sm font-bold text-[#8ba0c7]">Exit</button>
          <div className="min-w-0 text-center">
            <p className="text-sm font-black">{draft?.status === "COMPLETE" ? "Draft complete" : current ? `Round ${current.round} · Pick ${current.pickNumber}` : "Draft"}</p>
            {draft?.status === "LIVE" && <p className="text-xs font-bold tabular-nums text-[#19ffff]">{draft.paused ? "Paused" : clockLabel(remaining)}</p>}
            {draft?.status === "SCHEDULED" && <p className="text-xs text-[#8ba0c7]">Not started</p>}
          </div>
          {isCommissioner ? (
            <button type="button" aria-label="Draft settings" onClick={() => setSettingsOpen(true)} className="rounded-full p-2 text-[#8ba0c7]"><SlidersHorizontal className="size-5" /></button>
          ) : <span className="w-11" />}
        </header>

        {draft && (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-[#172338] px-3 py-2">
            {roundSlots.map((slot) => (
              <div key={slot.pickNumber} className={cn("w-16 shrink-0 rounded-lg border px-1.5 py-1.5 text-center", slot.pickNumber === current?.pickNumber ? "border-[#19ffff]" : "border-[#172338]")}>
                <p className="truncate text-xs font-bold text-white">{shortName(slot.teamName)}</p>
                <p className="truncate text-xs text-[#8ba0c7]">{slot.playerName ? shortName(slot.playerName) : slot.pickNumber}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex shrink-0 border-b border-[#172338]">
          {(["board", "players", "queue"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={cn("flex-1 py-2.5 text-sm font-bold capitalize", tab === item ? "text-white" : "text-[#5e7090]")}>{item}</button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!draft && <p className="p-6 text-center text-sm text-[#8ba0c7]">The draft board is not ready.</p>}
          {draft && tab === "board" && <DraftBoard draft={draft} currentPick={current?.pickNumber ?? null} />}
          {draft && tab === "players" && (
            <div>
              <div className="sticky top-0 space-y-2 bg-[#070a12] px-3 py-3">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players" className="w-full rounded-xl border border-[#263858] bg-[#101829] px-3 py-2.5 text-sm outline-none" />
                <div className="flex gap-2">{["ALL", "C", "W", "D", "G"].map((value) => <button key={value} type="button" onClick={() => setPosition(value)} className={cn("rounded-full px-3 py-1.5 text-sm font-bold", position === value ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{value}</button>)}</div>
              </div>
              <ul>
                {available.map((player) => (
                  <li key={player.nhlId}>
                    <button type="button" onClick={() => setArmed(player.nhlId ?? null)} className={cn("flex w-full items-center gap-3 border-b border-[#172338] px-3 py-3 text-left", armed === player.nhlId && "bg-[#10283a]")}>
                      <span className={cn("flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-xs font-black text-white", positionBar[player.position])}>{player.position}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{player.name}</span>
                        <span className="block text-xs text-[#8ba0c7]">{player.team}</span>
                      </span>
                      <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); if (player.nhlId == null) return; void act({ action: draft.queue.includes(player.nhlId) ? "queue-remove" : "queue-add", playerId: player.nhlId }) }} className="text-xs font-bold text-[#19ffff]">{player.nhlId != null && draft.queue.includes(player.nhlId) ? "Queued" : "Queue"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {draft && tab === "queue" && (
            <ul>
              {queued.length === 0 && <li className="p-6 text-center text-sm text-[#8ba0c7]">Your queue is empty.</li>}
              {queued.map((player) => (
                <li key={player.nhlId} className="flex items-center gap-3 border-b border-[#172338] px-3 py-3">
                  <span className={cn("flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-xs font-black text-white", positionBar[player.position])}>{player.position}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{player.name}</span>
                  <button type="button" onClick={() => void act({ action: "queue-remove", playerId: player.nhlId })} className="text-xs font-bold text-[#8ba0c7]">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {draft && tab === "players" && (
          <div className="shrink-0 border-t border-[#172338] bg-[#070a12] px-4 py-3">
            {error && <p className="mb-2 text-xs font-bold text-rose-300">{error}</p>}
            <button type="button" disabled={busy || armed == null || draft.status !== "LIVE" || draft.paused || (!draft.yourTurn && !isCommissioner)} onClick={() => armed != null && void act({ action: "pick", playerId: armed })} className="h-12 w-full rounded-full bg-[#19ffff] text-sm font-bold text-[#080c14] disabled:opacity-40">
              {draft.status !== "LIVE" ? "Waiting for the draft to start" : draft.yourTurn || isCommissioner ? "Draft" : "Waiting"}
            </button>
          </div>
        )}

        {settingsOpen && isCommissioner && draft && (
          <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl border-t border-[#1a263d] bg-[#070a12] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-black">Draft settings</h2>
              <button type="button" aria-label="Close draft settings" onClick={() => setSettingsOpen(false)} className="rounded-full p-2 text-[#8ba0c7]"><X className="size-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void act({ action: "start" })} className="h-12 rounded-xl bg-[#19ffff] text-sm font-bold text-[#080c14]">Start now</button>
              <button type="button" onClick={() => void act({ action: draft.paused ? "resume" : "pause" })} className="h-12 rounded-xl bg-[#172338] text-sm font-bold">{draft.paused ? "Resume" : "Pause"}</button>
            </div>
            <p className="mt-4 text-xs font-bold text-[#8ba0c7]">Timer</p>
            <div className="mt-2 flex gap-2">
              {[60, 90, 120, 180].map((seconds) => (
                <button key={seconds} type="button" onClick={() => void act({ action: "timer", timerSeconds: seconds })} className={cn("rounded-full px-3 py-1.5 text-sm font-bold", draft.timerSeconds === seconds ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{seconds}s</button>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DraftBoard({ draft, currentPick }: { draft: DraftView; currentPick: number | null }) {
  const columns = [...draft.teams].sort((a, b) => a.slot - b.slot)
  const rounds = Array.from({ length: draft.rounds }, (_, index) => index + 1)
  return (
    <div className="overflow-x-auto p-3">
      <div className="flex gap-1">
        <div className="w-8 shrink-0" />
        {columns.map((team) => <div key={team.slot} className="w-[4.75rem] shrink-0 truncate px-1 text-center text-xs font-bold text-[#8ba0c7]">{shortName(team.name)}</div>)}
      </div>
      {rounds.map((round) => (
        <div key={round} className="mt-1 flex gap-1">
          <div className="flex w-8 shrink-0 items-center justify-center text-xs font-bold text-[#5e7090]">{round}</div>
          {columns.map((team) => {
            const cell = draft.slots.find((slot) => slot.round === round && slot.slot === team.slot)
            if (!cell) return <div key={team.slot} className="h-14 w-[4.75rem]" />
            return (
              <div key={team.slot} className={cn("relative flex h-14 w-[4.75rem] flex-col justify-center rounded-md bg-[#101829] px-2", cell.pickNumber === currentPick && "ring-2 ring-[#19ffff]")}>
                {cell.position && <span className={cn("absolute inset-y-1 left-1 w-1 rounded-full", positionBar[cell.position] ?? "bg-[#5e7090]")} />}
                <span className={cn("truncate pl-2 text-xs font-bold", cell.playerName ? "text-white" : "text-[#5e7090]")}>{cell.playerName ? shortName(cell.playerName) : cell.pickNumber}</span>
                {cell.teamId !== team.id && <span className="truncate pl-2 text-[10px] font-bold leading-tight text-[#19ffff]">{shortName(cell.teamName)}</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
