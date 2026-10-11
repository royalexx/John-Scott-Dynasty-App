import { prisma } from "@/lib/prisma"

export async function getTeamDraftPickInventory(teamId: string) {
  const [owned, tradedAway] = await Promise.all([
    prisma.draftPick.findMany({
      where: { currentTeamId: teamId },
      orderBy: [{ season: "asc" }, { round: "asc" }],
      include: { originalTeam: { select: { id: true, name: true } } },
    }),
    prisma.draftPick.findMany({
      where: { originalTeamId: teamId, NOT: { currentTeamId: teamId } },
      orderBy: [{ season: "asc" }, { round: "asc" }],
      include: { currentTeam: { select: { id: true, name: true } } },
    }),
  ])
  return { owned, tradedAway }
}

export async function getLeagueDraftPicks(leagueId: string, season?: number) {
  return prisma.draftPick.findMany({
    where: { leagueId, ...(season === undefined ? {} : { season }) },
    include: {
      originalTeam: { select: { id: true, name: true } },
      currentTeam: { select: { id: true, name: true } },
    },
    orderBy: [{ season: "asc" }, { round: "asc" }],
  })
}
