"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, ChevronRight, CircleHelp, Handshake, Shield, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Player } from "@/lib/hockey-data"
import { PlayerPortrait } from "@/components/hockey/player-portrait"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

export interface TradePick {
  id: string
  label: string
  detail?: string
}

export interface TradeTeam {
  id: string
  name: string
  abbreviation?: string
  avatar?: string
  players: Player[]
  draftPicks?: TradePick[]
  faabAvailable?: number
}

export type TradeAsset =
  | { kind: "player"; player: Player }
  | { kind: "pick"; pick: TradePick }

export interface TradeProposal {
  from: TradeTeam
  to: TradeTeam
  offering: TradeAsset[]
  receiving: TradeAsset[]
  faabFrom?: number
  faabTo?: number
  note?: string
}

export interface TradeBuilderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  team: TradeTeam
  partners: TradeTeam[]
  onPlayerClick?: (player: Player, team: TradeTeam) => void
  onSendTrade: (trade: TradeProposal) => void
  initialPartnerId?: string | null
  initialOffering?: string[]
  initialReceiving?: string[]
}

type Step = 1 | 2 | 3

function PlayerAvatar({ player }: { player: Player }) {
  return <PlayerPortrait player={player} name={player.name} className="size-9 border border-[#2a3f66]" />
}

function TeamAvatar({ team }: { team: TradeTeam }) {
  if (team.avatar) return <img src={team.avatar} alt="" className="size-9 rounded-full object-cover" />
  return <div className="flex size-9 items-center justify-center rounded-full bg-[#172338] text-xs font-black text-[#19ffff]">{team.abbreviation ?? team.name.slice(0, 3).toUpperCase()}</div>
}

function AssetName({ asset }: { asset: TradeAsset }) {
  return asset.kind === "player" ? <>{asset.player.name}</> : <>{asset.pick.label}</>
}

export function TradeBuilderDialog({
  open,
  onOpenChange,
  team,
  partners,
  onPlayerClick,
  onSendTrade,
  initialPartnerId = null,
  initialOffering = [],
  initialReceiving = [],
}: TradeBuilderDialogProps) {
  const [step, setStep] = useState<Step>(1)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [offering, setOffering] = useState<string[]>([])
  const [receiving, setReceiving] = useState<string[]>([])
  const [faabFrom, setFaabFrom] = useState(0)
  const [faabTo, setFaabTo] = useState(0)
  const [note, setNote] = useState("")

  const partner = partners.find((candidate) => candidate.id === partnerId) ?? null
  const proposal = useMemo<TradeProposal | null>(() => {
    if (!partner) return null
    const playerAssets = (owner: TradeTeam, ids: string[]) => [
      ...owner.players.filter((player) => ids.includes(player.id)).map((player) => ({ kind: "player" as const, player })),
      ...(owner.draftPicks ?? []).filter((pick) => ids.includes(pick.id)).map((pick) => ({ kind: "pick" as const, pick })),
    ]
    return { from: team, to: partner, offering: playerAssets(team, offering), receiving: playerAssets(partner, receiving), faabFrom, faabTo, note }
  }, [faabFrom, faabTo, note, offering, partner, receiving, team])

  useEffect(() => {
    if (open) {
      setPartnerId(initialPartnerId)
      setOffering(initialOffering)
      setReceiving(initialReceiving)
      setStep(initialPartnerId ? 2 : 1)
    } else {
      setStep(1)
      setPartnerId(null)
      setOffering([])
      setReceiving([])
      setFaabFrom(0)
      setFaabTo(0)
      setNote("")
    }
  }, [open])

  const close = () => onOpenChange(false)
  const toggleAsset = (id: string, side: "offering" | "receiving") => {
    const setter = side === "offering" ? setOffering : setReceiving
    setter((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-auto flex h-[90vh] max-h-[90vh] max-w-[430px] flex-col rounded-t-3xl border-t border-[#1a263d] bg-[#070a12] p-0 text-white outline-none" showCloseButton={false}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#172338] px-4 py-3">
          <div className="flex items-center gap-2">
            {step > 1 && <button type="button" onClick={() => setStep((step - 1) as Step)} aria-label="Previous step" className="rounded-full p-1.5 text-[#8ba0c7] hover:bg-[#172338]"><ArrowLeft className="size-4" /></button>}
            <div>
              <DialogTitle className="text-base font-black text-white">Trade Builder</DialogTitle>
              <DialogDescription className="mt-1 text-xs text-[#5e7090]">Step {step} of 3 · {step === 1 ? "Choose a trade partner" : step === 2 ? "Select assets" : "Review and send"}</DialogDescription>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close trade builder" className="rounded-full p-2 text-[#8ba0c7] hover:bg-[#172338]"><X className="size-4" /></button>
        </div>

        <div className="flex shrink-0 gap-1 px-4 pt-3" aria-label="Trade progress">
          {[1, 2, 3].map((item) => <div key={item} className={cn("h-1 flex-1 rounded-full", item <= step ? "bg-[#19ffff]" : "bg-[#1b2842]")} />)}
        </div>

        <div className={cn("min-h-0 flex-1 overscroll-contain px-4 pb-4 pt-4", step === 2 ? "overflow-hidden" : "overflow-y-auto")}>
          {step === 1 && (
            <section>
              <h2 className="text-lg font-black">Who do you want to trade with?</h2>
              <p className="mt-1 text-xs text-[#8ba0c7]">Select a league mate to start building your offer.</p>
              <div className="mt-4 space-y-2">
                {partners.map((candidate) => {
                  const pickCount = candidate.draftPicks?.length ?? 0
                  return (
                    <button key={candidate.id} type="button" onClick={() => { setPartnerId(candidate.id); setStep(2) }} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors", candidate.id === partnerId ? "border-[#19ffff] bg-[#123246]" : "border-[#1b2842] bg-[#101829] hover:bg-[#172338]")}>
                      <TeamAvatar team={candidate} />
                      <span className="min-w-0 flex-1"><b className="block truncate text-sm">{candidate.name}</b><small className="text-xs text-[#5e7090]">{candidate.players.length} players{pickCount > 0 ? ` · ${pickCount} picks` : ""}</small></span>
                      {candidate.id === partnerId && <Check className="size-4 text-[#19ffff]" />}
                    </button>
                  )
                })}
                {!partners.length && <p className="rounded-xl border border-dashed border-[#34476a] p-6 text-center text-xs text-[#5e7090]">No trade partners available.</p>}
              </div>
            </section>
          )}

          {step === 2 && partner && (
            <section className="grid h-full min-h-0 grid-cols-2 gap-2 overflow-hidden px-0 py-1">
              <AssetList title="YOU SEND" owner={team} selected={offering} side="offering" onToggle={toggleAsset} onPlayerClick={onPlayerClick} faab={faabFrom} onFaabChange={setFaabFrom} />
              <AssetList title="YOU RECEIVE" owner={partner} selected={receiving} side="receiving" onToggle={toggleAsset} onPlayerClick={onPlayerClick} faab={faabTo} onFaabChange={setFaabTo} receive />
            </section>
          )}

          {step === 3 && proposal && (
            <section>
              <h2 className="text-lg font-black">Review trade</h2>
              <p className="mt-1 text-xs text-[#8ba0c7]">Make sure everything looks right before sending.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <ReviewColumn title={`You send · ${team.name}`} assets={proposal.offering} />
                <ReviewColumn title={`You receive · ${partner?.name}`} assets={proposal.receiving} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-[#101829] p-3 text-amber-300">You send: ${proposal.faabFrom ?? 0} FAAB</div><div className="rounded-lg bg-[#101829] p-3 text-amber-300">You receive: ${proposal.faabTo ?? 0} FAAB</div></div>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note to the manager (optional)" className="mt-3 min-h-16 w-full rounded-lg border border-[#263858] bg-[#101829] p-3 text-xs text-white outline-none placeholder:text-[#5e7090]" />
              <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">⚠️ You will have {team.players.filter((player) => !["IR", "IR_PLUS", "TAXI"].includes(player.slot)).length - proposal.offering.filter((asset) => asset.kind === "player" && !["IR", "IR_PLUS", "TAXI"].includes(asset.player.slot)).length + proposal.receiving.filter((asset) => asset.kind === "player" && !["IR", "IR_PLUS", "TAXI"].includes(asset.player.slot)).length}/27 players if accepted.</div>
              {!proposal.offering.length && !proposal.receiving.length && <div className="mt-3 flex gap-2 rounded-lg bg-[#172338] p-3 text-xs text-[#8ba0c7]"><CircleHelp className="size-4 shrink-0 text-[#19ffff]" />Add at least one asset to make a trade.</div>}
            </section>
          )}
        </div>

        <div className="shrink-0 flex gap-2 border-t border-[#1a263d] bg-[#070a12] p-4">
          {step === 1 && <button type="button" disabled={!partnerId} onClick={() => setStep(2)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#19ffff] text-sm font-bold text-[#080c14] disabled:opacity-40">Choose assets <ChevronRight className="size-4" /></button>}
          {step === 2 && <div className="flex w-full flex-col gap-2"><p className="text-center text-xs font-bold text-[#8ba0c7]">Sending {offering.length} · Receiving {receiving.length}</p><button type="button" disabled={!partner || (!offering.length && !receiving.length)} onClick={() => setStep(3)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#19ffff] text-sm font-bold text-[#080c14] disabled:opacity-40">Review proposal <ChevronRight className="size-4" /></button></div>}
          {step === 3 && <button type="button" disabled={!proposal || (!proposal.offering.length && !proposal.receiving.length)} onClick={() => { if (proposal) { onSendTrade(proposal); close() } }} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#19ffff] text-sm font-bold text-[#080c14] disabled:opacity-40">Send trade <Handshake className="size-4" /></button>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return <div className="my-1.5 flex items-center justify-between rounded bg-[#0b1220] px-2 py-1 text-xs font-black uppercase tracking-wider text-[#5e7090]"><span>{label}</span><span className="rounded bg-[#141e33] px-1.5 py-0.5 text-xs text-[#8ba0c7]">{count}</span></div>
}

function CompactTradePlayerRow({ player, selected, owner, onToggle, onPlayerClick }: { player: Player; selected: boolean; owner: TradeTeam; onToggle: () => void; onPlayerClick?: (player: Player, team: TradeTeam) => void }) {
  const position = player.slot === "IR" ? "IR" : player.slot === "TAXI" ? "TAXI" : player.slot === "F" ? "F" : player.position
  const positionClass = position === "G" ? "bg-sky-500 text-white" : position === "D" ? "bg-amber-600 text-white" : position === "C" ? "bg-blue-600 text-white" : position === "IR" ? "bg-rose-700 text-white" : position === "TAXI" ? "bg-amber-800 text-white" : position === "F" ? "bg-violet-600 text-white" : "bg-teal-600 text-white"
  const shortName = player.name.split(" ").slice(-1)[0]
  return <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onToggle() }} className={cn("flex w-full cursor-pointer items-center gap-1.5 rounded-lg border p-1.5 transition-colors", selected ? "border-[#19ffff]/50 bg-[#0c2231] text-white" : "border-[#141e33] bg-[#0d1424] text-[#cbd5e1] hover:bg-[#111c2e]")}>
    <input type="checkbox" checked={selected} onChange={(event) => { event.stopPropagation(); onToggle() }} onClick={(event) => event.stopPropagation()} aria-label={`Select ${player.name}`} className="size-3.5 shrink-0 rounded accent-[#19ffff]" />
    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded text-xs font-black", positionClass)}>{position === "LW" || position === "RW" ? "W" : position}</span>
    <button type="button" onClick={(event) => { event.stopPropagation(); onPlayerClick?.(player, owner) }} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"><PlayerAvatar player={player} /><span className="min-w-0"><b className="block truncate text-xs font-bold leading-tight text-white">{shortName}</b>    <small className="block text-xs tabular-nums text-[#5e7090]">{(player.schedule?.weekProjectedFantasyPoints ?? player.projPts).toFixed(1)}</small></span></button>
  </div>
}

function AssetList({ title, owner, selected, side, onToggle, onPlayerClick, faab, onFaabChange, receive = false }: {
  title: string
  owner: TradeTeam
  selected: string[]
  side: "offering" | "receiving"
  onToggle: (id: string, side: "offering" | "receiving") => void
  onPlayerClick?: (player: Player, team: TradeTeam) => void
  faab: number
  onFaabChange: (value: number) => void
  receive?: boolean
}) {
  const groups = [
    ["STARTERS", owner.players.filter((player) => ["C", "W", "LW", "RW", "F", "D", "G"].includes(player.slot)), "starter"],
    ["BENCH", owner.players.filter((player) => player.slot === "BN"), "player"],
    ["INJURED RESERVE", owner.players.filter((player) => player.slot === "IR"), "player"],
    ["TAXI SQUAD", owner.players.filter((player) => player.slot === "TAXI"), "player"],
  ] as const
  const picks = owner.draftPicks ?? []
  const assetCount = selected.length + (faab > 0 ? 1 : 0)
  return <div className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain"><div className="sticky top-0 z-20 mb-2 shrink-0 border-b border-[#1a263d] bg-[#070a12] pb-2 pt-1"><div className={cn("flex items-center gap-1 text-xs font-black uppercase tracking-wider", receive ? "text-rose-400" : "text-[#19ffff]")}><TeamAvatar team={owner} /><span className="truncate">{title}</span></div><div className="flex items-center justify-between gap-1"><p className="truncate text-xs font-bold text-white">{owner.name}</p><span className="shrink-0 rounded bg-[#172338] px-1.5 py-0.5 text-xs text-[#8ba0c7]">{assetCount} selected</span></div></div>
    {groups.map(([label, players]) => <section key={label}><SectionHeader label={label} count={players.length} />{players.length ? <div className="space-y-1.5">{players.map((player) => <CompactTradePlayerRow key={player.id} player={player} selected={selected.includes(player.id)} owner={owner} onToggle={() => onToggle(player.id, side)} onPlayerClick={onPlayerClick} />)}</div> : <p className="px-1.5 py-1 text-xs italic text-[#3e4c63]">None</p>}</section>)}
    <SectionHeader label="DRAFT PICKS" count={picks.length} />
    {picks.length ? <div className="grid grid-cols-1 gap-1 px-1 py-1">{picks.map((pick) => { const checked = selected.includes(pick.id); return <button type="button" key={pick.id} onClick={() => onToggle(pick.id, side)} className={cn("flex items-center justify-between rounded border p-1.5 text-xs font-bold transition-colors", checked ? "border-[#19ffff] bg-[#0c2231] text-[#19ffff]" : "border-[#16233b] bg-[#0d1424] text-[#8ba0c7] hover:border-[#2a3f66]")}>{pick.label}<span>{checked ? "✓" : ""}</span></button> })}</div> : <p className="px-1.5 py-1 text-xs italic text-[#3e4c63]">None</p>}
    <SectionHeader label="FAAB BUDGET" count={owner.faabAvailable ?? 100} />
    <div className="mx-1 mt-1 rounded-lg border border-[#16233b] bg-[#0a0f1a] p-2"><label className="flex items-center justify-between gap-1 text-xs font-bold text-[#8ba0c7]">FAAB Included <span className="flex items-center border border-[#263858] bg-[#101829] px-1.5 text-white">$<input type="number" min={0} max={owner.faabAvailable ?? 100} value={faab} onChange={(event) => onFaabChange(Math.max(0, Math.min(owner.faabAvailable ?? 100, Number(event.target.value) || 0)))} className="w-10 bg-transparent py-1 text-right text-xs outline-none" /></span></label><p className="mt-1 text-xs text-[#5e7090]">${owner.faabAvailable ?? 100} available</p></div>
  </div>
}

function ReviewColumn({ title, assets }: { title: string; assets: TradeAsset[] }) {
  return <div className="rounded-xl border border-[#1b2842] bg-[#101829] p-3"><h3 className="text-xs font-black uppercase tracking-wider text-[#5e7090]">{title}</h3><div className="mt-2 space-y-2">{assets.length ? assets.map((asset) => <div key={asset.kind === "player" ? asset.player.id : asset.pick.id} className="flex items-center gap-2 text-xs font-bold"><span className="size-1.5 rounded-full bg-[#19ffff]" /><AssetName asset={asset} /></div>) : <p className="text-xs text-[#5e7090]">Nothing selected</p>}</div></div>
}
