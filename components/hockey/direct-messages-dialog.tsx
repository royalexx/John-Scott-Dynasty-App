"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Search, Send, X } from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export interface DirectMessage {
  id: string
  senderId: string
  senderName: string
  text: string
  timestamp: string
  isMe: boolean
}

export interface ConversationMeta {
  id: string
  managerName: string
  handle: string
  teamName: string
  avatar: string
  lastMessage: string
  timestamp: string
  unread: boolean
}

type ConversationResponse = {
  managerId: string
  name: string
  handle: string
  teamName: string
  lastMessage: string
  timestamp: string
  unreadCount: number
}

export function DirectMessagesDialog({ open, onOpenChange, onTrade, onUnreadChange }: { open: boolean; onOpenChange: (open: boolean) => void; onTrade?: (conversation: ConversationMeta) => void; onUnreadChange?: (unread: boolean) => void }) {
  const [query, setQuery] = useState("")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationMeta[]>([])
  const [threads, setThreads] = useState<Record<string, DirectMessage[]>>({})
  const [draft, setDraft] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const readConversationIds = useRef(new Set<string>())
  const conversationLoadRef = useRef(0)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const active = conversations.find((conversation) => conversation.id === activeId) ?? null
  const thread = active ? threads[active.id] ?? [] : []
  const filtered = useMemo(() => conversations.filter((item) => `${item.managerName} ${item.teamName} ${item.handle}`.toLowerCase().includes(query.toLowerCase())), [conversations, query])

  const loadConversations = async () => {
    const requestId = ++conversationLoadRef.current
    const response = await fetch("/api/messages", { cache: "no-store" })
    if (!response.ok || requestId !== conversationLoadRef.current) return
    const data = await response.json() as ConversationResponse[]
    const mapped = data.map((item) => ({ id: item.managerId, managerName: item.name, handle: item.handle, teamName: item.teamName, avatar: item.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), lastMessage: item.lastMessage, timestamp: item.timestamp, unread: item.unreadCount > 0 && !readConversationIds.current.has(item.managerId) }))
    setConversations(mapped)
    onUnreadChange?.(mapped.some((item) => item.unread))
  }

  const loadThread = async (partnerId: string) => {
    const response = await fetch(`/api/messages?recipientId=${encodeURIComponent(partnerId)}`, { cache: "no-store" })
    if (!response.ok) return
    const messages = await response.json() as DirectMessage[]
    setThreads((current) => ({ ...current, [partnerId]: messages }))
  }

  useEffect(() => {
    if (!open) return
    void loadConversations()
    const timer = window.setInterval(() => {
      void loadConversations()
      const partnerId = activeIdRef.current
      if (partnerId) void loadThread(partnerId)
    }, 6000)
    return () => window.clearInterval(timer)
  }, [open])

  useEffect(() => { if (open && activeId) void loadThread(activeId) }, [open, activeId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [activeId, thread.length])

  const markConversationRead = async (partnerId: string) => {
    try {
      await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationPartnerId: partnerId }) })
    } finally {
      readConversationIds.current.delete(partnerId)
      await loadConversations()
    }
  }

  const selectConversation = (conversation: ConversationMeta) => {
    setActiveId(conversation.id)
    readConversationIds.current.add(conversation.id)
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, unread: false } : item))
    onUnreadChange?.(conversations.some((item) => item.id !== conversation.id && item.unread))
    void markConversationRead(conversation.id)
  }

  const handleSendMessage = async () => {
    if (!active || !draft.trim()) return
    const text = draft.trim()
    const optimistic: DirectMessage = { id: `optimistic-${Date.now()}`, senderId: "you", senderName: "You", text, timestamp: "Just now", isMe: true }
    setThreads((current) => ({ ...current, [active.id]: [...(current[active.id] ?? []), optimistic] }))
    setConversations((current) => current.map((item) => item.id === active.id ? { ...item, lastMessage: `You: ${text}`, timestamp: "Just now" } : item))
    setDraft("")
    const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: active.id, body: text }) })
    if (response.ok) await loadThread(active.id)
  }

  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="bottom" spring="gentle" overlayClassName="!z-40 !bg-black/70 supports-backdrop-filter:!backdrop-blur-sm" className="!fixed !bottom-0 !left-1/2 !right-auto !top-auto !z-50 !w-full !max-w-[430px] !-translate-x-1/2 !h-[85vh] !max-h-[85vh] !flex !flex-col !gap-0 !overflow-hidden !rounded-t-3xl !border-x !border-t !border-[#1a263d] !bg-[#070a12] !p-0 !text-white !shadow-2xl">
    <div className="shrink-0 border-b border-[#1a263d] p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2">{active && <button type="button" onClick={() => setActiveId(null)} aria-label="Back to direct messages"><ArrowLeft className="size-5" /></button>}<h2 className="text-lg font-black">{active ? active.handle : "Direct Messages"}</h2></div><button type="button" onClick={() => onOpenChange(false)} aria-label="Close direct messages"><X className="size-5" /></button></div>{!active && <div className="mt-3 flex items-center gap-2 rounded-full border border-[#1b2842] bg-[#0d1424] px-3 py-2"><Search className="size-4 text-[#5e7090]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search managers" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#5e7090]" /></div>}{active && <div className="mt-2 flex items-center justify-between text-xs text-[#6d86ab]"><span>{active.teamName}</span><button type="button" onClick={() => onTrade?.(active)} className="rounded-full bg-[#16233b] px-3 py-1 font-black text-[#19ffff]">Trade ⇄</button></div>}</div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">{active ? <div className="space-y-3">{thread.map((message) => <div key={message.id} className={cn("max-w-[82%] rounded-2xl px-3 py-2 text-sm", message.isMe ? "ml-auto rounded-tr-sm bg-[#0c2231] text-[#19ffff]" : "rounded-tl-sm bg-[#0d1424] text-[#cbd5e1]")}>{message.text}<small className="mt-1 block text-xs opacity-60">{message.timestamp}</small></div>)}<div ref={messagesEndRef} /></div> : <div className="space-y-1">{filtered.map((item) => <button key={item.id} type="button" onClick={() => selectConversation(item)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[#111c2e]"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#172338] text-xs font-black text-[#19ffff]">{item.avatar}</span><span className="min-w-0 flex-1"><b className="block text-sm">{item.managerName}</b><small className="text-xs text-[#6d86ab]">{item.handle} · {item.teamName}</small><span className="block truncate text-xs text-[#8ba0c7]">{item.lastMessage}</span></span><span className="text-xs text-[#5e7090]">{item.timestamp}</span>{item.unread && <i className="size-2 rounded-full bg-[#f43f5e]" />}</button>)}</div>}</div>
    {active && <form onSubmit={(event) => { event.preventDefault(); void handleSendMessage() }} className="flex shrink-0 items-center gap-2 border-t border-[#141e33] p-3"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message..." className="min-w-0 flex-1 rounded-full border border-[#1b2842] bg-[#0d1424] px-4 py-2 text-sm outline-none focus:border-[#19ffff]" /><button type="submit" aria-label="Send direct message" className="flex size-9 items-center justify-center rounded-full bg-[#19ffff] text-[#080c14]"><Send className="size-4" /></button></form>}
  </SheetContent></Sheet>
}
