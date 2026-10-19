import type { ActivityItem } from "@/lib/hockey-data"
import { getEasternDate } from "@/lib/season-calendar"

type ActivityRecord = {
  id: string
  action: "ADD" | "DROP" | "TRADE" | "COMMISSIONER"
  details: unknown
  createdAt: Date
  team: { name: string; manager: { name: string; handle: string } } | null
}

function previousEasternDay(now: Date) {
  const [year, month, day] = getEasternDate(now).split("-").map(Number)
  return getEasternDate(new Date(Date.UTC(year, month - 1, day - 1, 17)))
}

function relativeTime(createdAt: Date) {
  const now = new Date()
  const createdDay = getEasternDate(createdAt)
  const sameDay = createdDay === getEasternDate(now)
  if (createdDay === previousEasternDay(now)) return "Yesterday"
  if (sameDay && now.getTime() - createdAt.getTime() < 60_000) return "Just now"
  if (sameDay) return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).format(createdAt)
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).format(createdAt)
}

export function formatActivity(record: ActivityRecord): ActivityItem {
  const details = record.details && typeof record.details === "object" ? record.details as Record<string, unknown> : {}
  const player = typeof details.playerName === "string" ? details.playerName : record.action === "TRADE" ? "Trade assets" : "Roster transaction"
  const teamName = record.team?.name ?? "League"
  const handle = record.team?.manager.handle ?? "commissioner"
  const detail = record.action === "TRADE"
    ? `${typeof details.assetCount === "number" ? details.assetCount : 0} assets · ${teamName}`
    : typeof details.bidAmount === "number"
      ? `Bid $${details.bidAmount} · ${teamName}`
      : teamName
  return {
    id: record.id,
    owner: `@${handle}`,
    action: record.action === "COMMISSIONER" ? "TRADE" : record.action,
    player,
    detail,
    time: relativeTime(record.createdAt),
  }
}
