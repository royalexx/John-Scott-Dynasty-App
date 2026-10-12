import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"

const leagueId = "00000000-0000-0000-0000-000000000001"
const jsonFields = ["rosterPositions", "scoringSettings", "waiverSettings", "tradeSettings", "draftSettings"] as const

async function getLeague() {
  return prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true, name: true, currentWeek: true, rosterSize: true, taxiSlots: true, taxiMaxGames: true, irSlots: true,
      scoringSettings: true, rosterPositions: true, waiverSettings: true, tradeSettings: true, draftSettings: true,
    },
  })
}

async function commissionerSession() {
  const session = await getManagerSession()
  if (!session) return null
  const user = await prisma.user.findUnique({ where: { id: session.managerId }, select: { isCommissioner: true } })
  return user?.isCommissioner ? session : null
}

export async function GET() {
  const session = await getManagerSession()
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  const league = await getLeague()
  return league ? NextResponse.json(league) : NextResponse.json({ error: "League not found." }, { status: 404 })
}

export async function PATCH(request: Request) {
  if (!await commissionerSession()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 })
  const data: Record<string, unknown> = {}
  for (const field of jsonFields) {
    if (field in body) {
      if (typeof body[field] !== "object" || body[field] === null || Array.isArray(body[field])) {
        return NextResponse.json({ error: `${field} must be an object.` }, { status: 400 })
      }
      data[field] = body[field]
    }
  }
  for (const field of ["taxiSlots", "taxiMaxGames", "irSlots", "currentWeek"]) {
    if (field in body) {
      if (typeof body[field] !== "number" || !Number.isInteger(body[field]) || body[field] < 0) {
        return NextResponse.json({ error: `${field} must be a non-negative integer.` }, { status: 400 })
      }
      if (data.rosterPositions) {
        data.rosterSize = Object.values(data.rosterPositions as Record<string, unknown>)
          .filter((value): value is number => typeof value === "number")
          .reduce((total, value) => total + value, 0)
      }
      data[field] = body[field]
    }
  }
  const league = await prisma.league.update({ where: { id: leagueId }, data, select: {
    id: true, name: true, currentWeek: true, rosterSize: true, taxiSlots: true, taxiMaxGames: true, irSlots: true,
    scoringSettings: true, rosterPositions: true, waiverSettings: true, tradeSettings: true, draftSettings: true,
  } })
  return NextResponse.json(league)
}
