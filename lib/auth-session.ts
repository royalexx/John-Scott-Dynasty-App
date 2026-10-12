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
    return { ...session, isCommissioner: user.isCommissioner } as ManagerSession
  } catch {
    return null
  }
}
