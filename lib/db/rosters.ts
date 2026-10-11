import { PlayerStatus, SlotType } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function getTeamRoster(teamId: string) {
  return prisma.rosterSlot.findMany({
    where: { teamId },
    include: { player: true },
    orderBy: [{ slot: "asc" }, { player: { name: "asc" } }],
  })
}

export async function validateTaxiSquad(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { league: { select: { taxiMaxGames: true } } },
  })
  if (!team) return null

  const taxiSlots = await prisma.rosterSlot.findMany({
    where: { teamId, slot: SlotType.TAXI },
    include: { player: { select: { id: true, name: true, nhlGamesPlayed: true } } },
  })
  return taxiSlots
    .filter(({ player }) => player.nhlGamesPlayed > team.league.taxiMaxGames)
    .map(({ player }) => ({
      playerId: player.id,
      playerName: player.name,
      gamesPlayed: player.nhlGamesPlayed,
      maxGames: team.league.taxiMaxGames,
    }))
}

export async function getRosterWithCompliance(teamId: string) {
  const [roster, taxiViolations] = await Promise.all([
    getTeamRoster(teamId),
    validateTaxiSquad(teamId),
  ])
  return { roster, taxiViolations }
}

export function isEligibleForIr(status: PlayerStatus) {
  return status === PlayerStatus.IR || status === PlayerStatus.O
}
