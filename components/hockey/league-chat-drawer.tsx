"use client"

import { useEffect, useRef, useState } from "react"
import { MessageSquare, Send, X, Zap } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { ChatMessage } from "@/lib/hockey-data"

type LiveChatMessage = ChatMessage & { teamName?: string }

type LeagueChatDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLatestMessage?: (message: string) => void
  latestPreview?: string
  leagueId?: string
  readOnly?: boolean
}

/**
 * Bottom sheet is viewport bounded, keyboard accessible and safe-area aware.
 * In Vercel sample-data preview the composer remains disabled: no persistence.
 */
export function LeagueChatDrawer({
  open, onOpenChange, onLatestMessage, leagueId, readOnly = false,
}: LeagueChatDrawerProps) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let canceled = false
    const fetchMessages = async () => {
      try {
        const response = await fetch(`/api/chat${leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : ""}`, { cache: "no-store" })
        if (!response.ok) throw new Error("Chat unavailable")
        const data = await response.json() as LiveChatMessage[]
        if (canceled) return
        setMessages(data)
        const latest = data.at(-1)
        if (latest) onLatestMessage?.(`${latest.author}: ${latest.message}`)
      } catch {
        if (!canceled && !readOnly) setSendError("Chat messages could not be loaded.")
      }
    }
    void fetchMessages()
    return () => { canceled = true }
    // Refetch only when the drawer opens or league changes, not on each preview update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leagueId, readOnly])

  useEffect(() => {
    if (open && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [messages, open])

  useEffect(() => {
    if (!open) setSendError(null)
  }, [open])

  const send = async () => {
    const messageText = draft.trim()
    if (!messageText || !leagueId || readOnly || sending) return
    setSending(true)
    setSendError(null)
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId, body: messageText }),
      })
      if (!response.ok) throw new Error("Message send failed")
      const message = await response.json() as LiveChatMessage
      setMessages((current) => [...current, message])
      onLatestMessage?.(`${message.author}: ${message.message}`)
      setDraft("")
    } catch {
      // Preserve the unsent draft so a network error never destroys user input.
      setSendError("Message was not sent. Please try again.")
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        spring="gentle"
        overlayClassName="!z-40 !bg-black/75"
        className="!fixed !bottom-0 !left-1/2 !right-auto !top-auto !z-50 !flex !h-[85dvh] !max-h-[calc(100dvh-env(safe-area-inset-top))] !w-full !max-w-[430px] !-translate-x-1/2 !flex-col !gap-0 !overflow-hidden !rounded-t-3xl !border-x !border-t !border-border !bg-background !p-0 !text-foreground !shadow-2xl"
      >
        <SheetHeader className="flex shrink-0 flex-row items-center justify-between border-b border-border p-3 pl-4">
          <SheetTitle className="text-base font-bold">League chat</SheetTitle>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close league chat" className="ui-touch-target flex shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-hover hover:text-foreground">
            <X className="size-5" />
          </button>
        </SheetHeader>
        {readOnly && (
          <p className="shrink-0 border-b border-warning/30 bg-warning-surface px-4 py-2 text-xs font-semibold text-warning">
            Preview only · Messages cannot be sent or saved
          </p>
        )}
        <div ref={feedRef} data-testid="league-chat-feed" role="log" aria-label="League chat messages" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-muted">
              <MessageSquare className="size-7" aria-hidden="true" />
              <p className="text-sm">No messages yet</p>
            </div>
          )}
          {messages.map((msg) => msg.system ? (
            <div key={msg.id} className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-surface px-3 py-2">
              <Zap className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-xs font-medium text-warning">{msg.message}</p>
            </div>
          ) : (
            <div key={msg.id} className="flex items-start gap-2.5">
              <Avatar className="size-8 shrink-0 border border-border">
                <AvatarFallback className="bg-surface-raised text-xs text-brand">{msg.avatarInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="text-xs font-semibold text-foreground">{msg.author}</p>
                  <p className="text-xs text-text-muted">{msg.time}</p>
                </div>
                <p className="mt-1 break-words rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm text-text-secondary">{msg.message}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-border bg-background px-3 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {sendError && <p role="alert" className="mb-2 text-xs font-semibold text-danger">{sendError}</p>}
          <form onSubmit={(event) => { event.preventDefault(); void send() }} className="flex items-center gap-2">
            <label htmlFor="league-chat-input" className="sr-only">Chat message</label>
            <input
              id="league-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={readOnly ? "Read-only preview" : "Send a message..."}
              disabled={readOnly || !leagueId || sending}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border-strong bg-surface px-4 text-sm text-foreground outline-none placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-70"
            />
            <button type="submit" disabled={!draft.trim() || !leagueId || readOnly || sending} aria-label="Send message" className="ui-touch-target flex shrink-0 items-center justify-center rounded-xl bg-brand text-primary-foreground hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40">
              <Send className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
