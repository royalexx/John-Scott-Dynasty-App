import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"
import { easternTime12h } from "@/lib/format"

function formatMessage(message: { id: string; body: string; createdAt: Date; sender: { name: string; handle: string; managedTeams: { name: string }[] } }) {
  const teamName = message.sender.managedTeams[0]?.name ?? ""
  return { id: message.id, author: message.sender.name, avatarInitials: message.sender.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), message: message.body, time: easternTime12h.format(message.createdAt), teamName, teamAbbreviation: teamName.slice(0, 3).toUpperCase() }
}

const senderSelect = { name: true, handle: true, managedTeams: { select: { name: true }, take: 1 } } as const

export async function GET(request: Request) {
  const session = await getManagerSession()
  const leagueId = new URL(request.url).searchParams.get("leagueId")
  const team = session ? await prisma.team.findFirst({ where: { id: session.teamId, managerId: session.managerId } }) : null
  const targetLeagueId = leagueId ?? team?.leagueId
  if (!targetLeagueId || !team || (leagueId !== null && leagueId !== team.leagueId)) return NextResponse.json({ error: "Authentication required for this league." }, { status: 401 })
  const messages = await prisma.leagueMessage.findMany({ where: { leagueId: targetLeagueId }, orderBy: { createdAt: "desc" }, take: 50, include: { sender: { select: senderSelect } } })
  return NextResponse.json(messages.reverse().map(formatMessage))
}

export async function POST(request: Request) {
  const session = await getManagerSession()
  const body = await request.json().catch(() => null) as { leagueId?: unknown; body?: unknown } | null
  if (!session || typeof body?.leagueId !== "string" || typeof body.body !== "string" || !body.body.trim()) return NextResponse.json({ error: "Authentication and message body are required." }, { status: 400 })
  if (body.body.trim().length > 2000) return NextResponse.json({ error: "Messages must be 2000 characters or fewer." }, { status: 400 })
  const member = await prisma.team.findFirst({ where: { leagueId: body.leagueId, id: session.teamId, managerId: session.managerId } })
  if (!member) return NextResponse.json({ error: "You are not a member of this league." }, { status: 403 })
  const message = await prisma.leagueMessage.create({ data: { leagueId: body.leagueId, senderId: session.managerId, body: body.body.trim() }, include: { sender: { select: senderSelect } } })
  return NextResponse.json(formatMessage(message))
}
