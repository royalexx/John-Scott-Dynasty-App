import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import { easternTime12h } from "@/lib/format"

function formatTime(date: Date) {
  return easternTime12h.format(date)
}

async function caller() {
  const session = await getManagerSession()
  if (!session) return null
  const user = await prisma.user.findUnique({ where: { id: session.managerId } })
  if (!user) return null
  const team = await prisma.team.findFirst({ where: { id: session.teamId, managerId: session.managerId }, select: { leagueId: true } })
  return { user, leagueId: team?.leagueId ?? null }
}

export async function GET(request: Request) {
  const callerSession = await caller()
  if (!callerSession) return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  const { user, leagueId } = callerSession
  const url = new URL(request.url)
  if (url.searchParams.get("unreadOnly") === "1") {
    const unreadCount = await prisma.directMessage.count({ where: { recipientId: user.id, readAt: null } })
    return NextResponse.json([{ unreadCount }])
  }
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
  if (!leagueId) return NextResponse.json([])
  const [partners, latestByPair, unreadGroups] = await Promise.all([
    prisma.user.findMany({
      where: { id: { not: user.id }, managedTeams: { some: { leagueId } } },
      include: { managedTeams: { where: { leagueId }, select: { name: true }, take: 1 } },
      orderBy: { name: "asc" },
    }),
    prisma.directMessage.findMany({
      where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
      distinct: ["senderId", "recipientId"],
      orderBy: { createdAt: "desc" },
    }),
    prisma.directMessage.groupBy({
      by: ["senderId"],
      where: { recipientId: user.id, readAt: null },
      _count: { _all: true },
    }),
  ])
  const unreadBySender = new Map(unreadGroups.map((group) => [group.senderId, group._count._all]))
  const latestByPartner = new Map<string, typeof latestByPair[number]>()
  for (const message of latestByPair) {
    const partnerId = message.senderId === user.id ? message.recipientId : message.senderId
    const current = latestByPartner.get(partnerId)
    const messageTime = message.createdAt.getTime()
    const currentTime = current?.createdAt.getTime()
    if (currentTime == null || messageTime > currentTime || (messageTime === currentTime && message.senderId === user.id)) {
      latestByPartner.set(partnerId, message)
    }
  }
  const summaries = partners.map((partner) => {
    const latest = latestByPartner.get(partner.id)
    return {
      managerId: partner.id, name: partner.name, handle: `@${partner.handle}`, teamName: partner.managedTeams[0]?.name ?? "Unassigned",
      lastMessage: latest?.body ?? "Start a conversation", timestamp: latest ? formatTime(latest.createdAt) : "", unreadCount: unreadBySender.get(partner.id) ?? 0,
    }
  })
  return NextResponse.json(summaries)
}

export async function POST(request: Request) {
  const session = await getManagerSession()
  const body = await request.json().catch(() => null) as { recipientId?: unknown; body?: unknown } | null
  if (!session || typeof body?.recipientId !== "string" || typeof body.body !== "string" || !body.body.trim()) return NextResponse.json({ error: "Authentication and message body are required." }, { status: 400 })
  if (body.body.trim().length > 2000) return NextResponse.json({ error: "Messages must be 2000 characters or fewer." }, { status: 400 })
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
