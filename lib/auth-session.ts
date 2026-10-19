import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"

export type ManagerSession = {
  managerId: string
  teamId: string
  handle: string
  teamName: string
  isCommissioner: boolean
}

function sessionSecret() {
  return process.env.CRON_SECRET ?? "john-scott-dynasty-default-secret"
}

export function signManagerSession(payload: ManagerSession): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

export function verifyManagerSessionCookie(rawCookie: string): Partial<ManagerSession> | null {
  const separator = rawCookie.indexOf(".")
  if (separator <= 0 || rawCookie.indexOf(".", separator + 1) !== -1) return null
  const encoded = rawCookie.slice(0, separator)
  const signature = rawCookie.slice(separator + 1)
  const expected = createHmac("sha256", sessionSecret()).update(encoded).digest()
  const provided = Buffer.from(signature, "base64url")
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    if (!parsed || typeof parsed !== "object") return null
    return parsed as Partial<ManagerSession>
  } catch {
    return null
  }
}

export async function getManagerSession(): Promise<ManagerSession | null> {
  const value = (await cookies()).get("dynasty_manager")?.value
  if (!value) return null
  try {
    const session = verifyManagerSessionCookie(value)
    if (!session || typeof session.managerId !== "string" || typeof session.teamId !== "string") return null
    const team = await prisma.team.findFirst({
      where: { id: session.teamId, managerId: session.managerId },
      select: { id: true, name: true, manager: { select: { isCommissioner: true, handle: true } } },
    })
    if (!team) return null
    return {
      managerId: session.managerId,
      teamId: team.id,
      handle: team.manager.handle,
      teamName: team.name,
      isCommissioner: team.manager.isCommissioner === true,
    }
  } catch {
    return null
  }
}
