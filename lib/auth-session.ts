import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"

export type ManagerSession = {
  managerId: string
  teamId: string
  handle: string
  teamName: string
  isCommissioner: boolean
}

export async function getManagerSession(): Promise<ManagerSession | null> {
  const value = (await cookies()).get("dynasty_manager")?.value
  if (!value) return null
  try {
    const session = JSON.parse(value) as Partial<ManagerSession>
    if (typeof session.managerId !== "string" || typeof session.teamId !== "string" || typeof session.handle !== "string" || typeof session.teamName !== "string") return null
    const user = await prisma.user.findUnique({
      where: { id: session.managerId },
      select: { isCommissioner: true },
    })
    if (!user) return null
    // The database is the source of truth for the commissioner role; never trust the cookie flag.
    return {
      managerId: session.managerId,
      teamId: session.teamId,
      handle: session.handle,
      teamName: session.teamName,
      isCommissioner: user.isCommissioner === true,
    }
  } catch {
    return null
  }
}
