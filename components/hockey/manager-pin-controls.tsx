"use client"

import { useEffect, useState } from "react"

type Manager = {
  id: string
  name: string
  handle: string
  isCommissioner: boolean
}

/** Commissioner-only PIN assignment, with no file, localStorage, or PIN reveal. */
export function ManagerPinControls() {
  const [managers, setManagers] = useState<Manager[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [commissionerPin, setCommissionerPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/admin/roles", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load league managers.")
        return response.json() as Promise<{ managers: Manager[] }>
      })
      .then(({ managers: listed }) => {
        setManagers(listed)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not load managers." })
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedId || !/^\d{4}$/.test(commissionerPin) || !/^\d{4}$/.test(newPin)) {
      setMessage({ ok: false, text: "Select a manager and enter both four-digit PINs." })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/admin/manager-pins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ targetManagerId: selectedId, commissionerPin, newPin }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not update manager PIN.")
      setMessage({ ok: true, text: payload.message ?? "PIN updated. Tell your friend their new PIN privately." })
      setNewPin("")
    } catch (error: unknown) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "PIN reset failed." })
    } finally {
      setCommissionerPin("")
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-black uppercase tracking-wider text-amber-300">Manager PINs</h3>
        <p className="mt-1 text-xs leading-relaxed text-[#8ba0c7]">
          Set a four-digit PIN for a friend. Only its salted hash is stored in PostgreSQL.
          PINs cannot be viewed later, but you can assign a new one at any time.
        </p>
      </div>
      <form onSubmit={(event) => void submit(event)} autoComplete="off" className="space-y-3 rounded-xl border border-[#1c2c48] bg-[#0a1120] p-3">
        <label className="block text-xs font-bold text-white">
          Team manager
          <select
            aria-label="Team manager"
            value={selectedId}
            onChange={(event) => { setSelectedId(event.target.value); setNewPin(""); setMessage(null) }}
            disabled={saving || loading}
            className="mt-1.5 min-h-11 w-full rounded-lg bg-[#172338] px-3 text-sm text-white"
          >
            <option value="">Select a manager</option>
            {managers.filter((manager) => !manager.isCommissioner).map((manager) => (
              <option key={manager.id} value={manager.id}>{manager.name} (@{manager.handle})</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold text-white">
          Your commissioner PIN
          <input
            aria-label="Current commissioner PIN"
            type="password"
            value={commissionerPin}
            onChange={(event) => setCommissionerPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            disabled={saving}
            className="mt-1.5 min-h-11 w-full rounded-lg bg-[#172338] px-3 text-sm text-white"
          />
        </label>
        <label className="block text-xs font-bold text-white">
          New four-digit manager PIN
          <input
            aria-label="New manager PIN"
            type="password"
            value={newPin}
            onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            disabled={saving}
            className="mt-1.5 min-h-11 w-full rounded-lg bg-[#172338] px-3 text-sm text-white"
          />
        </label>
        <button
          type="submit"
          disabled={!selectedId || commissionerPin.length !== 4 || newPin.length !== 4 || saving}
          className="min-h-11 w-full rounded-lg bg-amber-400 px-3 text-sm font-black text-[#080c14] disabled:opacity-40"
        >
          {saving ? "Saving PIN..." : "Set manager PIN"}
        </button>
        {message && <p role="status" className={message.ok ? "text-xs text-emerald-400" : "text-xs text-rose-400"}>{message.text}</p>}
      </form>
    </section>
  )
}
