"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Delete, LockKeyhole } from "lucide-react"
import { cn } from "@/lib/utils"

export type PinGateTeam = {
  id: string
  name: string
  managerId: string
  managerName: string
  managerHandle: string
  avatarUrl?: string | null
}

export function PinGate({ teams }: { teams: PinGateTeam[] }) {
  const [selected, setSelected] = useState<PinGateTeam | null>(null)
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [shaking, setShaking] = useState(false)
  const [loading, setLoading] = useState(false)
  const submittedPin = useRef("")

  useEffect(() => {
    if (pin.length !== 4 || !selected || loading || submittedPin.current === pin) return
    submittedPin.current = pin
    setLoading(true)
    void fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerId: selected.managerId, pin }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Incorrect PIN.")
        window.location.reload()
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Incorrect PIN.")
        setPin("")
        submittedPin.current = ""
        setShaking(true)
        window.setTimeout(() => setShaking(false), 450)
      })
      .finally(() => setLoading(false))
  }, [loading, pin, selected])

  const addDigit = (digit: string) => {
    if (loading || pin.length >= 4) return
    setError("")
    submittedPin.current = ""
    setPin((current) => current + digit)
  }

  return (
    <main className="min-h-screen bg-[#050812] px-4 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[430px] flex-col justify-center">
        <header className="mb-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[#19ffff]/30 bg-[#102642] text-[#19ffff] shadow-[0_0_30px_rgba(25,255,255,0.12)]">
            <LockKeyhole className="size-7" />
          </div>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-[#19ffff]">John Scott Dynasty</p>
          <h1 className="mt-2 text-2xl font-black">Manager Access</h1>
          <p className="mt-2 text-sm text-[#8ba0c7]">Choose your team to unlock the league.</p>
        </header>

        {!selected ? (
          <div className="grid grid-cols-2 gap-2">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => { setSelected(team); setError("") }}
                className="flex min-h-24 items-center gap-3 rounded-2xl border border-[#1b2b46] bg-[#0d1424] p-3 text-left transition hover:border-[#19ffff]/60 hover:bg-[#102642] active:scale-[0.98]"
              >
                {team.avatarUrl ? <img src={team.avatarUrl} alt="" className="size-10 rounded-full object-cover" /> : <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#172338] text-xs font-black text-[#19ffff]">{team.managerName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>}
                <span className="min-w-0"><b className="block truncate text-xs">{team.name}</b><small className="mt-1 block truncate text-[10px] text-[#6d86ab]">@{team.managerHandle}</small></span>
              </button>
            ))}
          </div>
        ) : (
          <section className="rounded-3xl border border-[#1b2b46] bg-[#0d1424] p-5">
            <button type="button" onClick={() => { setSelected(null); setPin(""); setError(""); submittedPin.current = "" }} className="flex items-center gap-1 text-xs font-bold text-[#8ba0c7]"><ArrowLeft className="size-4" /> Change team</button>
            <div className="mt-6 text-center">
              <h2 className="text-xl font-black">{selected.name}</h2>
              <p className="mt-1 text-xs text-[#8ba0c7]">PIN for @{selected.managerHandle}</p>
              <div className={cn("mt-6 flex justify-center gap-3", shaking && "animate-[shake_0.45s_ease-in-out]")} aria-label="PIN progress">
                {[0, 1, 2, 3].map((index) => <span key={index} className={cn("size-3 rounded-full border", pin.length > index ? "border-[#19ffff] bg-[#19ffff] shadow-[0_0_10px_#19ffff]" : "border-[#5e7090]")} />)}
              </div>
              <p className="mt-4 min-h-5 text-xs text-rose-300">{error}</p>
              <div className="mx-auto mt-4 grid max-w-[280px] grid-cols-3 gap-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => <button key={digit} type="button" onClick={() => addDigit(digit)} className="flex size-16 items-center justify-center rounded-2xl border border-[#263858] bg-[#101829] text-xl font-black hover:border-[#19ffff] active:scale-90">{digit}</button>)}
                <span />
                <button type="button" onClick={() => addDigit("0")} className="flex size-16 items-center justify-center rounded-2xl border border-[#263858] bg-[#101829] text-xl font-black hover:border-[#19ffff] active:scale-90">0</button>
                <button type="button" aria-label="Backspace" onClick={() => { setError(""); submittedPin.current = ""; setPin((current) => current.slice(0, -1)) }} className="flex size-16 items-center justify-center rounded-2xl border border-[#263858] bg-[#101829] text-[#8ba0c7] hover:border-[#19ffff] active:scale-90"><Delete className="size-5" /></button>
              </div>
              <p className="mt-6 text-[11px] text-[#6d86ab]">Default league PIN is 1234</p>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
