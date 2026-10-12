import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getManagerSession } from "@/lib/auth-session"

async function requireCommissioner() {
  const session = await getManagerSession()
  if (!session?.isCommissioner) return null
  const user = await prisma.user.findUnique({ where: { id: session.managerId }, select: { isCommissioner: true } })
  return user?.isCommissioner ? session : null
}

export async function GET() {
  if (!await requireCommissioner()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const managers = await prisma.user.findMany({
    select: { id: true, name: true, handle: true, isCommissioner: true },
    orderBy: { handle: "asc" },
  })
  return NextResponse.json({ managers })
}

export async function PATCH(request: Request) {
  if (!await requireCommissioner()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const body = await request.json().catch(() => null) as { targetManagerId?: unknown; isCommissioner?: unknown } | null
  if (typeof body?.targetManagerId !== "string" || typeof body.isCommissioner !== "boolean") {
    return NextResponse.json({ error: "targetManagerId and isCommissioner are required." }, { status: 400 })
  }
  await prisma.user.update({
    where: { id: body.targetManagerId },
    data: { isCommissioner: body.isCommissioner },
  })
  return NextResponse.json({ success: true })
}
