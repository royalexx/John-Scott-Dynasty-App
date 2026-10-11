import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date)
}

async function caller(request: Request) {
  const session = await getManagerSession()
  const managerId = session?.managerId ?? new URL(request.url).searchParams.get("managerId")
  return managerId ? prisma.user.findUnique({ where: { id: managerId } }) : null
}

export async function GET(request: Request) {
  const user = await caller(request)
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  const url = new URL(request.url)
  const recipientId = url.searchParams.get("recipientId")
  if (recipientId) {
    const messages = await prisma.directMessage.findMany({
      where: { OR: [{ senderId: user.id, recipientId }, { senderId: recipientId, recipientId: user.id }] },
      orderBy: { createdAt: "asc" },
      include: { sender: { select: { name: true } } },
    })
    return NextResponse.json(messages.map((message) => ({
      id: message.id, senderId: message.senderId, senderName: message.sender.name, text: message.body,
      timestamp: formatTime(message.createdAt), isMe: message.senderId === user.id,
    })))
  }
  const partners = await prisma.user.findMany({
    where: { id: { not: user.id }, managedTeams: { some: {} } },
    include: { managedTeams: { select: { name: true }, take: 1 } },
    orderBy: { name: "asc" },
  })
  const summaries = await Promise.all(partners.map(async (partner) => {
    const messages = await prisma.directMessage.findMany({
      where: { OR: [{ senderId: user.id, recipientId: partner.id }, { senderId: partner.id, recipientId: user.id }] },
      orderBy: { createdAt: "desc" }, take: 1,
    })
    const unreadCount = await prisma.directMessage.count({ where: { senderId: partner.id, recipientId: user.id, readAt: null } })
    const latest = messages[0]
    return {
      managerId: partner.id, name: partner.name, handle: `@${partner.handle}`, teamName: partner.managedTeams[0]?.name ?? "Unassigned",
      lastMessage: latest?.body ?? "Start a conversation", timestamp: latest ? formatTime(latest.createdAt) : "", unreadCount,
    }
  }))
  return NextResponse.json(summaries)
}

export async function POST(request: Request) {
  const session = await getManagerSession()
  const body = await request.json().catch(() => null) as { recipientId?: unknown; body?: unknown } | null
  if (!session || typeof body?.recipientId !== "string" || typeof body.body !== "string" || !body.body.trim()) return NextResponse.json({ error: "Authentication and message body are required." }, { status: 400 })
  if (body.recipientId === session.managerId) return NextResponse.json({ error: "You cannot message yourself." }, { status: 400 })
  const recipient = await prisma.user.findUnique({
    where: { id: body.recipientId },
    select: { id: true, managedTeams: { select: { leagueId: true }, take: 1 } },
  })
  const senderTeam = await prisma.team.findFirst({ where: { id: session.teamId, managerId: session.managerId }, select: { leagueId: true } })
  if (!recipient || !senderTeam || recipient.managedTeams[0]?.leagueId !== senderTeam.leagueId) {
    return NextResponse.json({ error: "That manager is not available in your league." }, { status: 404 })
  }
  const message = await prisma.directMessage.create({ data: { senderId: session.managerId, recipientId: body.recipientId, body: body.body.trim() }, include: { sender: { select: { name: true } } } })
  return NextResponse.json({ id: message.id, senderId: message.senderId, senderName: message.sender.name, text: message.body, timestamp: formatTime(message.createdAt), isMe: true })
}

export async function PATCH(request: Request) {
  const session = await getManagerSession()
  const body = await request.json().catch(() => null) as { conversationPartnerId?: unknown } | null
  if (!session || typeof body?.conversationPartnerId !== "string") return NextResponse.json({ error: "Authentication required." }, { status: 400 })
  await prisma.directMessage.updateMany({ where: { senderId: body.conversationPartnerId, recipientId: session.managerId, readAt: null }, data: { readAt: new Date() } })
  return NextResponse.json({ success: true })
}
