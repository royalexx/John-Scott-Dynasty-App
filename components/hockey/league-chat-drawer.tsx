"use client"

import { useEffect, useRef, useState } from "react"
import { Send, X, Zap } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { ChatMessage } from "@/lib/hockey-data"

type LiveChatMessage = ChatMessage & { teamName?: string }

export function LeagueChatDrawer({ open, onOpenChange, onLatestMessage, latestPreview, leagueId }: { open: boolean; onOpenChange: (open: boolean) => void; onLatestMessage?: (message: string) => void; latestPreview?: string; leagueId?: string }) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const feedRef = useRef<HTMLDivElement>(null)
  const load = async () => {
    const response = await fetch(`/api/chat${leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : ""}`, { cache: "no-store" })
    if (!response.ok) return
    const data = await response.json() as LiveChatMessage[]
    setMessages(data)
    const latest = data.at(-1)
    if (latest) onLatestMessage?.(`${latest.author}: ${latest.message}`)
  }
  useEffect(() => { void load() }, [leagueId])
  useEffect(() => { if (open) { void load(); if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight } }, [open])
  const send = async () => {
    if (!draft.trim() || !leagueId) return
    const text = draft.trim()
    setDraft("")
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leagueId, body: text }) })
    if (response.ok) {
      const message = await response.json() as LiveChatMessage
      setMessages((current) => [...current, message])
      onLatestMessage?.(`${message.author}: ${message.message}`)
    }
  }
  if (!open) return null
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="bottom" spring="gentle" overlayClassName="!z-40 !bg-black/70 supports-backdrop-filter:!backdrop-blur-sm" className="!fixed !bottom-0 !left-1/2 !right-auto !top-auto !z-50 !w-full !max-w-[430px] !-translate-x-1/2 !h-[85vh] !max-h-[85vh] !flex !flex-col !gap-0 !overflow-hidden !rounded-t-3xl !border-x !border-t !border-[#1a263d] !bg-[#070a12] !p-0 !text-white !shadow-2xl"><SheetHeader className="shrink-0 flex-row items-center justify-between border-b border-[#141e33] p-4"><SheetTitle className="text-sm font-black"># general-chat</SheetTitle><button type="button" onClick={() => onOpenChange(false)} aria-label="Close league chat"><X className="size-5 text-[#8ba0c7]" /></button></SheetHeader><div ref={feedRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">{messages.map((msg) => msg.system ? <div key={msg.id} className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2"><Zap className="size-4 text-amber-400" /><p className="text-xs font-medium text-amber-300">{msg.message}</p></div> : <div key={msg.id} className="flex items-start gap-2.5"><Avatar className="size-8 shrink-0 border border-zinc-700"><AvatarFallback className="bg-[#172338] text-xs text-[#19ffff]">{msg.avatarInitials}</AvatarFallback></Avatar><div className="min-w-0"><div className="flex items-baseline gap-2"><p className="text-xs font-semibold">{msg.author}</p><p className="text-xs text-[#5e7090]">{msg.time}</p></div><p className="mt-0.5 rounded-2xl rounded-tl-sm bg-[#0d1424] px-3 py-2 text-sm text-[#cbd5e1]">{msg.message}</p></div></div>)}</div><form onSubmit={(event) => { event.preventDefault(); void send() }} className="flex shrink-0 items-center gap-2 border-t border-[#141e33] bg-[#070a12] p-3"><span className="text-lg">😊</span><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Send a message..." className="min-w-0 flex-1 rounded-full border border-[#1b2842] bg-[#0d1424] px-4 py-2 text-sm text-white outline-none placeholder:text-[#5e7090] focus:border-[#19ffff]" /><button type="submit" aria-label="Send message" className="flex size-9 items-center justify-center rounded-full bg-[#19ffff] text-[#080c14]"><Send className="size-4" /></button></form></SheetContent></Sheet>
}
