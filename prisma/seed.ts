import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { PrismaClient, PlayerStatus, Position, SlotType } from "@prisma/client"
import { getMatchupsForWeek, getTeamRoster, roster, standings } from "../lib/hockey-data"

type RegistryPlayer = {
  nhlId: number
  name: string
  team?: string
  position?: string
  headshot?: string
  injuryStatus?: string | null
  nhlGamesPlayed?: number
  currentSeasonStats?: { gamesPlayed?: number } | null
}

const prisma = new PrismaClient()
const positions = new Set<string>(Object.values(Position))
const slots = new Set<string>(Object.values(SlotType))

function enumPosition(value: string | undefined): Position {
  return positions.has(value ?? "") ? (value as Position) : Position.C
}

function playerStatus(value: string | null | undefined): PlayerStatus {
  if (value === "IR" || value === "O" || value === "DTD") return value
  return PlayerStatus.HEALTHY
}

async function main() {
  const source = await readFile(join(process.cwd(), "public", "data", "nhl-players.json"), "utf8")
  const registry = JSON.parse(source) as RegistryPlayer[]

  for (const player of registry) {
    await prisma.player.upsert({
      where: { id: player.nhlId },
      update: {
        name: player.name,
        teamAbbrev: player.team ?? "FA",
        position: enumPosition(player.position),
        nhlGamesPlayed: player.nhlGamesPlayed ?? player.currentSeasonStats?.gamesPlayed ?? 0,
        injuryStatus: playerStatus(player.injuryStatus),
        headshotUrl: player.headshot ?? null,
      },
      create: {
        id: player.nhlId,
        name: player.name,
        teamAbbrev: player.team ?? "FA",
        position: enumPosition(player.position),
        nhlGamesPlayed: player.nhlGamesPlayed ?? player.currentSeasonStats?.gamesPlayed ?? 0,
        injuryStatus: playerStatus(player.injuryStatus),
        headshotUrl: player.headshot ?? null,
      },
    })
  }

  const league = await prisma.league.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {
      currentSeason: 2026,
      currentWeek: 1,
      rosterSize: 27,
      taxiSlots: 2,
      irSlots: 1,
      taxiMaxGames: 50,
      rosterPositions: { C: 3, W: 6, F: 3, D: 6, G: 2, BN: 7 },
      waiverSettings: { type: "FAAB", faabBudget: 100, minBid: 0, holdHours: 48 },
      tradeSettings: { reviewType: "COMMISSIONER", reviewHours: 24, deadlineWeek: 18, allowPickTrading: true },
      draftSettings: { type: "LINEAR", rounds: 5, timerSeconds: 120, scheduledDate: "2027-08-15T18:00:00Z", orderType: "REVERSE_STANDINGS" },
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "John Scott Dynasty",
      currentSeason: 2026,
      currentWeek: 1,
      rosterSize: 27,
      taxiSlots: 2,
      irSlots: 1,
      taxiMaxGames: 50,
      scoringSettings: {
        format: "head-to-head-points",
        points: { goal: 3, assist: 2, shot: 0.2, hit: 0.2, block: 0.2, win: 4, save: 0.2 },
      },
      rosterPositions: { C: 3, W: 6, F: 3, D: 6, G: 2, BN: 7 },
      waiverSettings: { type: "FAAB", faabBudget: 100, minBid: 0, holdHours: 48 },
      tradeSettings: { reviewType: "COMMISSIONER", reviewHours: 24, deadlineWeek: 18, allowPickTrading: true },
      draftSettings: { type: "LINEAR", rounds: 5, timerSeconds: 120, scheduledDate: "2027-08-15T18:00:00Z", orderType: "REVERSE_STANDINGS" },
    },
  })

  const teams = []
  for (const [index, standing] of standings.entries()) {
    // The Montreal Monarchs / @commissioner manager is always seeded as the league commissioner.
    const handle = standing.owner === "You" || standing.team === "Montreal Monarchs" ? "commissioner" : standing.owner.replace(/^@/, "")
    const isCommish = handle === "commissioner"
    const name = isCommish ? "Commissioner" : handle
    const user = await prisma.user.upsert({
      where: { handle },
      update: { name, pin: "1234", isCommissioner: isCommish },
      create: {
        email: `${handle}@example.com`,
        name,
        handle,
        pin: "1234",
        isCommissioner: isCommish,
      },
    })
    const team = await prisma.team.upsert({
      where: { leagueId_managerId: { leagueId: league.id, managerId: user.id } },
      update: { name: standing.team, faabBalance: standing.faabRemaining, waiverPriority: index + 1 },
      create: {
        leagueId: league.id,
        managerId: user.id,
        name: standing.team,
        faabBalance: standing.faabRemaining,
        waiverPriority: index + 1,
      },
    })
    teams.push(team)
  }

  await prisma.matchup.deleteMany({ where: { leagueId: league.id, season: league.currentSeason } })
  const teamByName = new Map(teams.map((team) => [team.name, team]))
  for (let week = 1; week <= 24; week += 1) {
    for (const matchup of getMatchupsForWeek(week)) {
      const homeTeam = teamByName.get(matchup.homeTeam)
      const awayTeam = teamByName.get(matchup.awayTeam)
      if (!homeTeam || !awayTeam) continue
      await prisma.matchup.create({
        data: {
          leagueId: league.id,
          season: league.currentSeason,
          week,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
        },
      })
    }
  }

  const registryByName = new Map(registry.map((player) => [player.name.toLowerCase(), player]))
  for (const [index, team] of teams.entries()) {
    const teamRoster = getTeamRoster(standings[index].team, roster)
    await prisma.rosterSlot.deleteMany({ where: { teamId: team.id } })
    for (const playerSlot of teamRoster) {
      const player = registryByName.get(playerSlot.name.toLowerCase())
      const slot = slots.has(playerSlot.slot) ? (playerSlot.slot as SlotType) : SlotType.BN
      if (player) {
        await prisma.rosterSlot.create({
          data: { teamId: team.id, playerId: player.nhlId, slot },
        })
      }
    }
  }

  for (const team of teams) {
    for (const season of [2027, 2028, 2029]) {
      for (let round = 1; round <= 5; round += 1) {
        await prisma.draftPick.upsert({
          where: {
            leagueId_season_round_originalTeamId: {
              leagueId: league.id,
              season,
              round,
              originalTeamId: team.id,
            },
          },
          update: { currentTeamId: team.id },
          create: {
            leagueId: league.id,
            season,
            round,
            originalTeamId: team.id,
            currentTeamId: team.id,
          },
        })
      }
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
