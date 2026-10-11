import { cookies } from "next/headers"

export type ManagerSession = {
  managerId: string
  teamId: string
  handle: string
  teamName: string
}

export async function getManagerSession(): Promise<ManagerSession | null> {
  const value = (await cookies()).get("dynasty_manager")?.value
  if (!value) return null
  try {
    const session = JSON.parse(value) as Partial<ManagerSession>
    if (typeof session.managerId !== "string" || typeof session.teamId !== "string" || typeof session.handle !== "string" || typeof session.teamName !== "string") return null
    return session as ManagerSession
  } catch {
    return null
  }
}
