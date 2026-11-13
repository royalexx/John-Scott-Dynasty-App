import fs from "node:fs"
import path from "node:path"
import { ActivityAction, AssetType, ClaimStatus, PlayerStatus, Position, Prisma, SlotType, TradeStatus } from "@prisma/client"
import { getLockSummary } from "@/lib/services/lineup-locks"
import { isSlotLocked } from "@/lib/lineup-lock"
import { prisma } from "@/lib/prisma"
import { nextWaiverProcessAt, WAIVER_RESOLUTIONS } from "@/lib/waiver-run"
import { countActiveRosterSlots, DEFAULT_BENCH_CAPACITY, displacedLandingSlot, hasRoomForBenchAcquisition, previewPlayerTransfers, STARTER_ELIGIBILITY } from "@/lib/roster-eligibility"
import { getCurrentFantasyWeek } from "@/lib/season-calendar"
import { freezeWeekLineup, FUTURE_LINEUP_LOCK_MESSAGE, FUTURE_LINEUP_PREVIEW_MESSAGE, isWeekLineupLocked } from "@/lib/services/week-lineups"
import { captureStartedDailyGamesForTeam } from "@/lib/services/daily-game-lineups"

type TransactionClient = Prisma.TransactionClient
const injuredStatuses = new Set<PlayerStatus>([PlayerStatus.IR, PlayerStatus.O, PlayerStatus.DTD])
const registryPositions = new Set<string>(Object.values(Position))

type RegistryPlayer = {
  id?: string
  nhlId?: number
  name?: string
  team?: string
  position?: string
  headshot?: string
  injuryStatus?: string | null
  nhlGamesPlayed?: number
  currentSeasonStats?: { gamesPlayed?: number } | null
}

let registryCache: { mtimeMs: number; byId: Map<number, RegistryPlayer> } | null = null

function registryPlayerId(player: RegistryPlayer): number | null {
  if (Number.isInteger(player.nhlId)) return player.nhlId as number
  const match = /^nhl-(\d+)$/.exec(player.id ?? "")
  return match ? Number(match[1]) : null
}

function cachedRegistryPlayer(playerId: number): RegistryPlayer | undefined {
  const filePath = path.join(process.cwd(), "public", "data", "nhl-players.json")
  let mtimeMs: number
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs
  } catch {
    return undefined
  }
  if (!registryCache || registryCache.mtimeMs !== mtimeMs) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as RegistryPlayer[]
    const byId = new Map<number, RegistryPlayer>()
    for (const player of data) {
      const id = registryPlayerId(player)
      if (id != null) byId.set(id, player)
    }
    registryCache = { mtimeMs, byId }
  }
  return registryCache.byId.get(playerId)
}

function registryPosition(value: string | undefined): Position {
  return value && registryPositions.has(value) ? (value as Position) : Position.C
}

function registryStatus(value: string | null | undefined): PlayerStatus {
  if (value === PlayerStatus.IR || value === PlayerStatus.O || value === PlayerStatus.DTD) return value
  return PlayerStatus.HEALTHY
}

function registryGamesPlayed(player: RegistryPlayer): number {
  const games = player.nhlGamesPlayed ?? player.currentSeasonStats?.gamesPlayed ?? 0
  return Number.isFinite(games) ? Math.max(0, Math.trunc(games)) : 0
}

/** Inserts a Player row from the NHL registry when the id has never appeared in a boxscore. */
export async function ensurePlayerFromRegistry(tx: Prisma.TransactionClient, playerId: number) {
  const existing = await tx.player.findUnique({ where: { id: playerId } })
  if (existing) return existing
  const player = cachedRegistryPlayer(playerId)
  if (!player) throw new Error("Player to add not found")
  const data = {
    name: player.name?.trim() || "Unknown Player",
    teamAbbrev: player.team?.trim() || "FA",
    position: registryPosition(player.position),
    nhlGamesPlayed: registryGamesPlayed(player),
    injuryStatus: registryStatus(player.injuryStatus),
    headshotUrl: player.headshot ?? null,
  }
  return tx.player.upsert({
    where: { id: playerId },
    update: data,
    create: { id: playerId, ...data },
  })
}

export interface SubmitWaiverClaimParams {
  teamId: string
  playerToAddId: number
  playerToDropId?: number | null
  bidAmount: number
}

export async function submitWaiverClaim(params: SubmitWaiverClaimParams) {
  if (!Number.isInteger(params.bidAmount) || params.bidAmount < 0) throw new Error("Bid amount must be a non-negative integer")
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: params.teamId }, select: { leagueId: true, faabBalance: true, league: { select: { rosterSize: true, currentSeason: true, rosterPositions: true } } } })
    if (!team) throw new Error("Team not found")
    if (team.faabBalance < params.bidAmount) throw new Error("Insufficient FAAB balance")
    await ensurePlayerFromRegistry(tx, params.playerToAddId)
    const alreadyRostered = await tx.rosterSlot.findFirst({ where: { playerId: params.playerToAddId, team: { leagueId: team.leagueId } }, select: { id: true } })
    if (alreadyRostered) throw new Error("Player is already on a league roster")
    if (params.playerToDropId != null) {
      const dropSlot = await tx.rosterSlot.findUnique({
        where: { teamId_playerId: { teamId: params.teamId, playerId: params.playerToDropId } },
        select: { slot: true },
      })
      if (!dropSlot) throw new Error("Dropped player must be on your roster")
    }
    const currentSlots = await tx.rosterSlot.findMany({
      where: { teamId: params.teamId }, select: { playerId: true, slot: true },
    })
    const positions = (team.league.rosterPositions ?? {}) as Record<string, number>
    if (!hasRoomForBenchAcquisition(
      currentSlots, team.league.rosterSize, positions.BN ?? DEFAULT_BENCH_CAPACITY, params.playerToDropId,
    )) {
      throw new Error("A bench slot and an active roster spot must be available after the selected drop.")
    }
    return tx.waiverClaim.create({
      data: {
        teamId: params.teamId,
        playerToAddId: params.playerToAddId,
        playerToDropId: params.playerToDropId ?? null,
        bidAmount: params.bidAmount,
        processDate: nextWaiverProcessAt(team.league.currentSeason),
      },
      include: { playerToAdd: true, playerToDrop: true },
    })
  })
}

export async function processWaiversForLeague(leagueId: string, now: Date = new Date()) {
  // One transaction per league. Overlapping cron runs wait on the advisory lock, then re-read claims.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${leagueId}))`
    const claims = await tx.waiverClaim.findMany({
      where: { status: ClaimStatus.PENDING, processDate: { lte: now }, team: { leagueId } },
      include: { team: true, playerToAdd: true, playerToDrop: true },
      orderBy: [{ bidAmount: "desc" }, { team: { waiverPriority: "asc" } }, { processDate: "asc" }],
    })
    const claimedPlayers = new Set<number>()
    let processed = 0
    for (const claim of claims) {
      if (claimedPlayers.has(claim.playerToAddId)) continue
      // Coordinate awards with interactive roster moves for this team.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claim.teamId}))`
      const team = await tx.team.findUnique({ where: { id: claim.teamId }, select: { leagueId: true, league: { select: { currentSeason: true, lineupLockMode: true } } } })
      if (!team || team.leagueId !== leagueId) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED } })
        continue
      }
      if (team.league.lineupLockMode === "DAILY") {
        // Capture started-game membership before dropping or awarding players.
        // Use the actual wall clock, not the historical processDate cutoff.
        await captureStartedDailyGamesForTeam(tx, claim.teamId, team.league.currentSeason)
      }
      const existingAdd = await tx.rosterSlot.findFirst({ where: { playerId: claim.playerToAddId, team: { leagueId } }, select: { id: true } })
      if (existingAdd) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.ALREADY_ROSTERED } })
        continue
      }
      const dropSlot = claim.playerToDropId == null
        ? null
        : await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId: claim.teamId, playerId: claim.playerToDropId } } })
      if (claim.playerToDropId != null && !dropSlot) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.DROP_MISSING } })
        continue
      }
      // Recheck at award time. Claims made earlier may no longer have capacity.
      const [rosterSlots, league] = await Promise.all([
        tx.rosterSlot.findMany({ where: { teamId: claim.teamId }, select: { playerId: true, slot: true } }),
        tx.league.findUnique({ where: { id: leagueId }, select: { rosterSize: true, rosterPositions: true } }),
      ])
      const rosterPositions = (league?.rosterPositions ?? {}) as Record<string, number>
      if (!league || !hasRoomForBenchAcquisition(
        rosterSlots, league.rosterSize, rosterPositions.BN ?? DEFAULT_BENCH_CAPACITY, claim.playerToDropId,
      )) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.ROSTER_FULL } })
        continue
      }

      // A failed roster insert aborts the Postgres transaction. The savepoint lets this claim fail without undoing earlier awards.
      await tx.$executeRaw`SAVEPOINT waiver_claim`
      if (dropSlot) {
        await tx.rosterSlot.delete({ where: { id: dropSlot.id } })
        await tx.activityLog.create({ data: { leagueId, teamId: claim.teamId, action: ActivityAction.DROP, details: { playerId: claim.playerToDropId, playerName: claim.playerToDrop?.name ?? null } } })
      }
      const charged = await tx.team.updateMany({
        where: { id: claim.teamId, faabBalance: { gte: claim.bidAmount } },
        data: { faabBalance: { decrement: claim.bidAmount } },
      })
      if (charged.count === 0) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT waiver_claim`
        await tx.$executeRaw`RELEASE SAVEPOINT waiver_claim`
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.INSUFFICIENT_FAAB } })
        continue
      }
      try {
        await tx.rosterSlot.create({ data: { teamId: claim.teamId, leagueId: team.leagueId, playerId: claim.playerToAddId, slot: SlotType.BN } })
      } catch (error: unknown) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT waiver_claim`
        await tx.$executeRaw`RELEASE SAVEPOINT waiver_claim`
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.ALREADY_ROSTERED } })
          continue
        }
        throw error
      }
      await tx.$executeRaw`RELEASE SAVEPOINT waiver_claim`
      await tx.activityLog.create({ data: { leagueId, teamId: claim.teamId, action: ActivityAction.ADD, details: { playerId: claim.playerToAddId, playerName: claim.playerToAdd.name, bidAmount: claim.bidAmount, outcome: "Won" } } })
      await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.SUCCESSFUL, resolution: WAIVER_RESOLUTIONS.WON } })
      await tx.waiverClaim.updateMany({
        where: { team: { leagueId }, playerToAddId: claim.playerToAddId, status: ClaimStatus.PENDING, processDate: { lte: now }, id: { not: claim.id } },
        data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.OUTBID },
      })
      await rotateWaiverPriority(tx, leagueId, claim.teamId)
      claimedPlayers.add(claim.playerToAddId)
      processed += 1
    }
    return processed
  }, { timeout: 30_000 })
}

async function rotateWaiverPriority(tx: TransactionClient, leagueId: string, winningTeamId: string) {
  await tx.$executeRaw`
    UPDATE "Team" AS team
    SET "waiverPriority" = ranked.priority::int
    FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          ORDER BY CASE WHEN id = ${winningTeamId}::uuid THEN 1 ELSE 0 END,
                   "waiverPriority",
                   id
        ) AS priority
      FROM "Team"
      WHERE "leagueId" = ${leagueId}::uuid
    ) AS ranked
    WHERE team.id = ranked.id
  `
}

export interface TradeAssetInput {
  fromTeamId: string
  toTeamId: string
  assetType: AssetType
  playerId?: number
  draftPickId?: string
  faabAmount?: number
}

export async function createTradeOffer(params: {
  leagueId: string
  proposingTeamId: string
  receivingTeamId: string
  assets: TradeAssetInput[]
  expiresAt?: Date
}) {
  if (params.assets.length === 0) throw new Error("A trade must include at least one asset.")
  if (params.proposingTeamId === params.receivingTeamId) throw new Error("Teams must be different")
  const teams = await prisma.team.findMany({
    where: { id: { in: [params.proposingTeamId, params.receivingTeamId] } },
    select: { id: true, leagueId: true },
  })
  const proposing = teams.find((team) => team.id === params.proposingTeamId)
  const receiving = teams.find((team) => team.id === params.receivingTeamId)
  if (!proposing || !receiving || proposing.leagueId !== params.leagueId || receiving.leagueId !== params.leagueId) {
    throw new Error("Both teams must belong to this league.")
  }
  for (const asset of params.assets) {
    const fromOk = asset.fromTeamId === params.proposingTeamId || asset.fromTeamId === params.receivingTeamId
    const toOk = asset.toTeamId === params.proposingTeamId || asset.toTeamId === params.receivingTeamId
    if (!fromOk || !toOk || asset.fromTeamId === asset.toTeamId) throw new Error("Trade assets must transfer between the two teams in the offer")
  }
  const league = await prisma.league.findUnique({
    where: { id: params.leagueId },
    select: { currentWeek: true, tradeSettings: true },
  })
  if (league) {
    const settings = (league.tradeSettings ?? {}) as { deadlineWeek?: number; allowPickTrading?: boolean }
    if (typeof settings.deadlineWeek === "number" && league.currentWeek > settings.deadlineWeek) {
      throw new Error(`The trade deadline (Week ${settings.deadlineWeek}) has passed`)
    }
    if (settings.allowPickTrading === false && params.assets.some((asset) => asset.assetType === AssetType.PICK)) {
      throw new Error("Draft pick trading is disabled in this league")
    }
  }
  return prisma.tradeOffer.create({
    data: {
      leagueId: params.leagueId,
      proposingTeamId: params.proposingTeamId,
      receivingTeamId: params.receivingTeamId,
      expiresAt: params.expiresAt,
      assets: { create: params.assets.map((asset) => ({ ...asset })) },
    },
    include: { assets: true },
  })
}

export async function executeTrade(tradeOfferId: string) {
  const result = await prisma.$transaction(async (tx) => {
    // Do not let two concurrent acceptances process the same offer twice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tradeOfferId}))`
    const offer = await tx.tradeOffer.findUnique({
      where: { id: tradeOfferId },
      include: { assets: true, league: { select: { currentSeason: true, lineupLockMode: true, rosterSize: true, rosterPositions: true, taxiSlots: true, irSlots: true, tradeSettings: true } } },
    })
    if (!offer || offer.status !== TradeStatus.PENDING) throw new Error("Trade offer is not pending")
    // Lock both teams in stable order, matching roster moves and waiver awards.
    for (const teamId of [offer.proposingTeamId, offer.receivingTeamId].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${teamId}))`
    }
    const teams = await tx.team.findMany({
      where: { id: { in: [offer.proposingTeamId, offer.receivingTeamId] } },
      select: { id: true, name: true, leagueId: true, faabBalance: true },
    })
    if (teams.length !== 2 || teams.some((team) => team.leagueId !== offer.leagueId)) throw new Error("Both teams must belong to this league.")
    if (offer.expiresAt && offer.expiresAt.getTime() <= Date.now()) {
      const cancelled = await tx.tradeOffer.updateMany({ where: { id: offer.id, status: TradeStatus.PENDING }, data: { status: TradeStatus.CANCELLED } })
      if (cancelled.count !== 1) throw new Error("Trade offer is not pending")
      return { expired: true as const, offer: null }
    }
    const deadlineWeek = ((offer.league.tradeSettings ?? {}) as { deadlineWeek?: number }).deadlineWeek
    if (typeof deadlineWeek === "number" && getCurrentFantasyWeek(offer.league.currentSeason) > deadlineWeek) {
      throw new Error("The trade deadline has passed.")
    }
    const lock = await getLockSummary(offer.league.currentSeason, offer.league.lineupLockMode)
    if (lock.mode === "WEEKLY" && lock.weekStarted) await freezeWeekLineup(tx, offer.leagueId, offer.league.currentSeason, lock.week)
    if (lock.mode === "DAILY") {
      // Both team locks are held. Preserve all started-game assignments before a
      // trade changes ownership, even when the player has finished today's game.
      for (const teamId of [offer.proposingTeamId, offer.receivingTeamId].sort()) {
        await captureStartedDailyGamesForTeam(tx, teamId, offer.league.currentSeason)
      }
    }
    const balances = new Map(teams.map((team) => [team.id, team.faabBalance]))
    for (const asset of offer.assets) {
      if (![offer.proposingTeamId, offer.receivingTeamId].includes(asset.fromTeamId) || ![offer.proposingTeamId, offer.receivingTeamId].includes(asset.toTeamId) || asset.fromTeamId === asset.toTeamId) {
        throw new Error("Trade assets must transfer between the two teams in the offer")
      }
      if (asset.assetType === AssetType.PLAYER) {
        if (asset.playerId == null || !(await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId: asset.fromTeamId, playerId: asset.playerId } } }))) throw new Error("A traded player is no longer on the sending roster")
      } else if (asset.assetType === AssetType.PICK) {
        if (asset.draftPickId == null || !(await tx.draftPick.findFirst({ where: { id: asset.draftPickId, currentTeamId: asset.fromTeamId } }))) throw new Error("A traded pick is no longer owned by the sending team")
      } else {
        const amount = asset.faabAmount ?? 0
        if (amount < 0 || (balances.get(asset.fromTeamId) ?? 0) < amount) throw new Error("Insufficient FAAB for trade")
        balances.set(asset.fromTeamId, (balances.get(asset.fromTeamId) ?? 0) - amount)
        balances.set(asset.toTeamId, (balances.get(asset.toTeamId) ?? 0) + amount)
      }
    }
    const rosterSlots = await tx.rosterSlot.findMany({
      where: { teamId: { in: [offer.proposingTeamId, offer.receivingTeamId] } },
      select: { teamId: true, playerId: true, slot: true },
    })
    // Every incoming traded player is placed on BN, regardless of their old slot.
    // Simulate both sides of the trade before writing anything so swaps are
    // validated simultaneously, not by temporary intermediate roster state.
    const resulting = previewPlayerTransfers(
      rosterSlots,
      teams.map((team) => team.id),
      offer.assets.filter((asset) => asset.assetType === AssetType.PLAYER && asset.playerId != null).map((asset) => ({
        fromTeamId: asset.fromTeamId, toTeamId: asset.toTeamId, playerId: asset.playerId as number,
      })),
      SlotType.BN,
    )
    for (const team of teams) {
      try {
        assertRosterWithinCapacity(offer.league, resulting.get(team.id) ?? [])
      } catch (error: unknown) {
        throw new Error(`${team.name}: ${error instanceof Error ? error.message : "Invalid roster after trade"}`)
      }
    }
    for (const asset of offer.assets) {
      if (asset.assetType === AssetType.PLAYER && asset.playerId != null) {
        const destination = await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId: asset.fromTeamId, playerId: asset.playerId } } })
        if (!destination) throw new Error("A traded player is no longer available")
        const occupied = await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId: asset.toTeamId, playerId: asset.playerId } } })
        if (occupied) throw new Error("Receiving team already owns a traded player")
        await tx.rosterSlot.update({ where: { id: destination.id }, data: { teamId: asset.toTeamId, slot: SlotType.BN, lockedAt: null } })
      }
      if (asset.assetType === AssetType.PICK && asset.draftPickId) await tx.draftPick.update({ where: { id: asset.draftPickId }, data: { currentTeamId: asset.toTeamId } })
    }
    for (const [teamId, balance] of balances) await tx.team.update({ where: { id: teamId }, data: { faabBalance: balance } })
    await tx.tradeOffer.update({ where: { id: tradeOfferId }, data: { status: TradeStatus.PROCESSED } })
    await tx.activityLog.create({ data: { leagueId: offer.leagueId, teamId: offer.proposingTeamId, action: ActivityAction.TRADE, details: { tradeOfferId, assetCount: offer.assets.length } } })
    await tx.activityLog.create({ data: { leagueId: offer.leagueId, teamId: offer.receivingTeamId, action: ActivityAction.TRADE, details: { tradeOfferId, assetCount: offer.assets.length } } })
    return { expired: false as const, offer }
  })
  if (result.expired) throw new Error("This trade offer has expired.")
  return result.offer
}

type SlotPlayer = { injuryStatus: PlayerStatus; nhlGamesPlayed: number; position: string }

/** Throws if `player` may not occupy `slot` under the league rules (pure IR, taxi GP cap, position eligibility). */
function assertSlotEligible(player: SlotPlayer, slot: SlotType, taxiMaxGames: number, name: string) {
  if (slot === SlotType.IR && player.injuryStatus !== PlayerStatus.IR) throw new Error(`${name} is not eligible for injured reserve (pure IR only)`)
  if (slot === SlotType.IR_PLUS) throw new Error("IR+ is not enabled in this league")
  if (slot === SlotType.TAXI && player.nhlGamesPlayed >= taxiMaxGames) throw new Error(`${name} is not eligible for the taxi squad`)
  const allowed = STARTER_ELIGIBILITY[slot]
  if (allowed && !allowed.includes(player.position)) throw new Error(`${name} (${player.position}) cannot play ${slot}`)
}

function slotCapacity(league: { rosterPositions: Prisma.JsonValue; taxiSlots: number; irSlots: number }, slot: SlotType) {
  if (slot === SlotType.TAXI) return league.taxiSlots
  if (slot === SlotType.IR) return league.irSlots
  const positions = (league.rosterPositions ?? {}) as Record<string, number>
  if (slot === SlotType.BN) return positions.BN ?? DEFAULT_BENCH_CAPACITY
  return positions[slot] ?? 0
}

/** Final-state validation: every mutation must fit all configured slots, not only the destination. */
function assertRosterWithinCapacity(
  league: { rosterSize: number; rosterPositions: Prisma.JsonValue; taxiSlots: number; irSlots: number },
  roster: ReadonlyArray<{ slot: SlotType }>,
) {
  const counts = new Map<SlotType, number>()
  for (const placement of roster) {
    counts.set(placement.slot, (counts.get(placement.slot) ?? 0) + 1)
  }
  for (const slot of Object.values(SlotType)) {
    const capacity = slotCapacity(league, slot)
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new Error(`Invalid league capacity for ${slot}`)
    }
    if ((counts.get(slot) ?? 0) > capacity) {
      throw new Error(`${slot} is full (maximum ${capacity})`)
    }
  }
  if (countActiveRosterSlots(roster) > league.rosterSize) {
    throw new Error(`Active roster exceeds the ${league.rosterSize}-player limit`)
  }
}

/**
 * Moves a player to `targetSlot`. If `targetPlayerId` is given (or the slot is full) the occupant
 * is displaced. They take the vacated slot only when their position can play it; otherwise they move
 * to the bench. A full bench blocks the swap. Every placement is validated for both players.
 */
export async function updateRosterPlacement(teamId: string, playerId: number, targetSlot: SlotType, targetPlayerId?: number, week?: number) {
  return prisma.$transaction(async (tx) => {
    // Serialize simultaneous moves by the same team before reading placement state.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${teamId}))`
    const slot = await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId, playerId } }, include: { player: true, team: { include: { league: true } } } })
    if (!slot) throw new Error("Player is not on this roster")
    const league = slot.team.league
    if (league.lineupLockMode === "DAILY") {
      await captureStartedDailyGamesForTeam(tx, teamId, league.currentSeason)
    }
    const lock = await getLockSummary(league.currentSeason, league.lineupLockMode)
    const selectedWeek = week ?? lock.week
    if (isWeekLineupLocked(lock, selectedWeek)) throw new Error(FUTURE_LINEUP_LOCK_MESSAGE)
    // A future-week selection must never move the current live RosterSlot. Until
    // future plans have their own persisted state, this view is read-only.
    if (selectedWeek > lock.week) throw new Error(FUTURE_LINEUP_PREVIEW_MESSAGE)
    // An injured (IR-status) starter may always be moved onto IR, even while starters are locked.
    const injuredToIr = slot.player.injuryStatus === "IR" && (targetSlot === SlotType.IR || targetSlot === SlotType.IR_PLUS)
    if (!injuredToIr && (isSlotLocked(lock, slot.slot, slot.player.teamAbbrev) || (lock.mode === "WEEKLY" && isSlotLocked(lock, targetSlot, slot.player.teamAbbrev)))) {
      throw new Error(lock.mode === "WEEKLY" ? "Starting lineups are locked until next week (first game has started)" : "Player's roster slot is locked (their game has started)")
    }
    if (slot.slot === targetSlot) return tx.rosterSlot.findMany({ where: { teamId }, include: { player: true }, orderBy: { slot: "asc" } })
    assertSlotEligible(slot.player, targetSlot, league.taxiMaxGames, slot.player.name)

    const occupants = await tx.rosterSlot.findMany({ where: { teamId, slot: targetSlot, id: { not: slot.id } }, include: { player: true }, orderBy: { id: "asc" } })
    let swapWith = targetPlayerId !== undefined ? await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId, playerId: targetPlayerId } }, include: { player: true } }) : null
    if (targetPlayerId !== undefined && (!swapWith || swapWith.slot !== targetSlot)) throw new Error("The player you are swapping with has moved; refresh and try again")
    const capacity = slotCapacity(league, targetSlot)
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error(`${targetSlot} is not an enabled roster slot`)
    if (!swapWith && occupants.length >= capacity) {
      // Never silently overfill the bench. Other full slots may auto-displace
      // their first occupant for backwards compatibility with existing flows.
      if (targetSlot === SlotType.BN) throw new Error("Bench is full. Select a valid swap.")
      swapWith = occupants[0] ?? null
    }

    if (swapWith) {
      if (isSlotLocked(lock, swapWith.slot, swapWith.player.teamAbbrev) || isSlotLocked(lock, slot.slot, swapWith.player.teamAbbrev)) throw new Error("The target roster slot is locked")
      const benchCount = await tx.rosterSlot.count({ where: { teamId, slot: SlotType.BN, id: { notIn: [slot.id, swapWith.id] } } })
      const landing = displacedLandingSlot(slot.slot, swapWith.player.position, benchCount < slotCapacity(league, SlotType.BN))
      if (!landing) throw new Error(`${swapWith.player.name} (${swapWith.player.position}) cannot play ${slot.slot}, and the bench is full`)
      assertSlotEligible(swapWith.player, landing as SlotType, league.taxiMaxGames, swapWith.player.name)
      await tx.rosterSlot.update({ where: { id: slot.id }, data: { slot: targetSlot } })
      await tx.rosterSlot.update({ where: { id: swapWith.id }, data: { slot: landing as SlotType } })
    } else {
      await tx.rosterSlot.update({ where: { id: slot.id }, data: { slot: targetSlot } })
    }
    const resultingRoster = await tx.rosterSlot.findMany({ where: { teamId }, include: { player: true }, orderBy: { slot: "asc" } })
    assertRosterWithinCapacity(league, resultingRoster)
    return resultingRoster
  })
}