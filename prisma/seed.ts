import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Prisma, PrismaClient, PlayerStatus, Position, SlotType } from "@prisma/client"
import { getMatchupsForWeek, getTeamRoster, roster, standings } from "../lib/hockey-data"
import { DEFAULT_LEAGUE_SCORING } from "../lib/scoring"
import { hashManagerPin } from "../lib/pin-crypto"
import { getCurrentFantasyWeek } from "../lib/season-calendar"
import { STARTER_ELIGIBILITY } from "../lib/roster-eligibility"

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

const INITIAL_SLOT_LIMITS: Record<SlotType, number> = {
  C: 3, W: 6, F: 3, D: 6, G: 2, BN: 7, TAXI: 2, IR: 1, IR_PLUS: 0,
}
const STARTERS: SlotType[] = [SlotType.C, SlotType.W, SlotType.F, SlotType.D, SlotType.G]
const ACTIVE = new Set<SlotType>([...STARTERS, SlotType.BN])

/** The legacy display rosters are not guaranteed to be legal database fixtures. */
function legalSeedSlot(
  player: RegistryPlayer,
  requested: SlotType,
  current: ReadonlyMap<SlotType, number>,
): SlotType | null {
  const position = enumPosition(player.position)
  const injured = playerStatus(player.injuryStatus)
  const games = player.nhlGamesPlayed ?? player.currentSeasonStats?.gamesPlayed ?? 0
  const activeCount = [...current].reduce((total, [slot, count]) => total + (ACTIVE.has(slot) ? count : 0), 0)
  const fits = (slot: SlotType) => {
    if ((current.get(slot) ?? 0) >= INITIAL_SLOT_LIMITS[slot]) return false
    if (ACTIVE.has(slot) && activeCount >= 27) return false
    if (slot === SlotType.IR && injured !== PlayerStatus.IR) return false
    if (slot === SlotType.TAXI && (injured !== PlayerStatus.HEALTHY || games >= 50)) return false
    const allowed = STARTER_ELIGIBILITY[slot]
    return !allowed || allowed.includes(position)
  }
  const candidates = [
    requested,
    ...STARTERS.filter((slot) => STARTER_ELIGIBILITY[slot]?.includes(position)),
    SlotType.BN,
    SlotType.TAXI,
    SlotType.IR,
  ]
  return candidates.find((slot) => fits(slot)) ?? null
}

/**
 * This script creates the initial demo league. It is intentionally NOT a re-seed or
 * synchronization tool: rerunning the old implementation reset credentials,
 * rosters, FAAB, fixtures and traded draft picks.
 */
async function assertSafeInitialSeed() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Initial demo seeding is forbidden in production.")
  }
  if (process.env.SEED_EMPTY_LEAGUE !== "YES_I_HAVE_VERIFIED_THE_DATABASE") {
    throw new Error(
      "Initial seeding is destructive. Point DATABASE_URL to an isolated, empty development database and set SEED_EMPTY_LEAGUE=YES_I_HAVE_VERIFIED_THE_DATABASE.",
    )
  }

  // Read-only checks must complete before ANY player upsert or league write.
  const [users, leagues, teams, rosters, matchups, picks, drafts] = await prisma.$transaction([
    prisma.user.count(),
    prisma.league.count(),
    prisma.team.count(),
    prisma.rosterSlot.count(),
    prisma.matchup.count(),
    prisma.draftPick.count(),
    prisma.draft.count(),
  ])
  if ([users, leagues, teams, rosters, matchups, picks, drafts].some((count) => count !== 0)) {
    throw new Error(
      "Refusing to seed: the database already contains league, manager, roster, matchup or draft state. Seeding would overwrite existing information.",
    )
  }
}

async function main() {
  await assertSafeInitialSeed()
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
      currentWeek: getCurrentFantasyWeek(2026),
      rosterSize: 27,
      taxiSlots: 2,
      irSlots: 1,
      taxiMaxGames: 50,
      rosterPositions: { C: 3, W: 6, F: 3, D: 6, G: 2, BN: 7 },
      waiverSettings: { type: "FAAB", faabBudget: 100, minBid: 0, holdHours: 48 },
      tradeSettings: { reviewType: "COMMISSIONER", reviewHours: 24, deadlineWeek: 18, allowPickTrading: true },
      draftSettings: { type: "LINEAR", rounds: 5, timerSeconds: 120, scheduledDate: "2027-08-15T18:00:00Z", orderType: "REVERSE_STANDINGS" },
      scoringSettings: { ...DEFAULT_LEAGUE_SCORING },
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "John Scott Dynasty",
      currentSeason: 2026,
      currentWeek: getCurrentFantasyWeek(2026),
      rosterSize: 27,
      taxiSlots: 2,
      irSlots: 1,
      taxiMaxGames: 50,
      scoringSettings: { ...DEFAULT_LEAGUE_SCORING },
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
    // Fixed initial PIN is only for disposable test fixtures; never store it in plaintext.
    const fixturePinHash = hashManagerPin("1234")
    const user = await prisma.user.upsert({
      where: { handle },
      update: { name, pin: fixturePinHash, isCommissioner: isCommish },
      create: {
        email: `${handle}@example.com`,
        name,
        handle,
        pin: fixturePinHash,
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
  const assignedPlayers = new Map<number, string>()
  let skippedDuplicateAssignments = 0
  let repairedPlacements = 0
  let skippedUnplaceablePlayers = 0
  for (const [index, team] of teams.entries()) {
    const teamRoster = getTeamRoster(standings[index].team, roster)
    const current = new Map<SlotType, number>()
    await prisma.rosterSlot.deleteMany({ where: { teamId: team.id } })
    for (const playerSlot of teamRoster) {
      const player = registryByName.get(playerSlot.name.toLowerCase())
      const desired = slots.has(playerSlot.slot) ? (playerSlot.slot as SlotType) : SlotType.BN
      if (player) {
        const originalTeam = assignedPlayers.get(player.nhlId)
        if (originalTeam) {
          // The legacy demonstration lists overlap. A player can have only
          // one owner in a league; preserve the first assignment deterministically.
          console.warn(`[seed] Skipping duplicate ${player.name} for ${team.name} (already assigned to ${originalTeam})`)
          skippedDuplicateAssignments += 1
          continue
        }
        const slot = legalSeedSlot(player, desired, current)
        if (!slot) {
          console.warn(`[seed] No legal roster slot for ${player.name} on ${team.name}; skipping fixture entry.`)
          skippedUnplaceablePlayers += 1
          continue
        }
        if (slot !== desired) {
          console.warn(`[seed] Moved ${player.name} from invalid ${desired} to ${slot} on ${team.name}.`)
          repairedPlacements += 1
        }
        try {
          await prisma.rosterSlot.create({
            data: { teamId: team.id, leagueId: team.leagueId, playerId: player.nhlId, slot },
          })
          current.set(slot, (current.get(slot) ?? 0) + 1)
          assignedPlayers.set(player.nhlId, team.name)
        } catch (error: unknown) {
          // Unexpected conflicts must remain fatal; never bypass the database constraint.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new Error(`Duplicate roster assignment for ${player.name} (team ${team.name})`)
          }
          throw error
        }
      }
    }
  }

  console.info(`[seed] Assigned ${assignedPlayers.size} unique players; repaired ${repairedPlacements} invalid slots; skipped ${skippedDuplicateAssignments} duplicates and ${skippedUnplaceablePlayers} unplaceable entries.`)

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
