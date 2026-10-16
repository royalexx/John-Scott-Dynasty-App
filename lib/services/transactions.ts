import { ActivityAction, AssetType, ClaimStatus, PlayerStatus, Prisma, SlotType, TradeStatus } from "@prisma/client"
import { getLockSummary } from "@/lib/services/lineup-locks"
import { isSlotLocked } from "@/lib/lineup-lock"
import { prisma } from "@/lib/prisma"
import { nextWaiverProcessAt, WAIVER_RESOLUTIONS } from "@/lib/waiver-run"
import { freezeWeekLineup, FUTURE_LINEUP_LOCK_MESSAGE, isWeekLineupLocked } from "@/lib/services/week-lineups"

type TransactionClient = Prisma.TransactionClient
const injuredStatuses = new Set<PlayerStatus>([PlayerStatus.IR, PlayerStatus.O, PlayerStatus.DTD])
const RESERVE_SLOTS: SlotType[] = [SlotType.TAXI, SlotType.IR, SlotType.IR_PLUS]

export interface SubmitWaiverClaimParams {
  teamId: string
  playerToAddId: number
  playerToDropId?: number | null
  bidAmount: number
}

export async function submitWaiverClaim(params: SubmitWaiverClaimParams) {
  if (!Number.isInteger(params.bidAmount) || params.bidAmount < 0) throw new Error("Bid amount must be a non-negative integer")
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: params.teamId }, select: { leagueId: true, faabBalance: true, league: { select: { rosterSize: true, currentSeason: true } } } })
    if (!team) throw new Error("Team not found")
    if (team.faabBalance < params.bidAmount) throw new Error("Insufficient FAAB balance")
    // A drop is optional while the team has an open roster spot; it is only required when the roster is full.
    if (params.playerToDropId == null) {
      const rosterCount = await tx.rosterSlot.count({ where: { teamId: params.teamId, slot: { notIn: RESERVE_SLOTS } } })
      if (rosterCount >= team.league.rosterSize) throw new Error("Roster is full. You must select a player to drop.")
    }

    const addPlayer = await tx.player.findUnique({ where: { id: params.playerToAddId }, select: { id: true } })
    if (!addPlayer) throw new Error("Player to add not found")
    const alreadyRostered = await tx.rosterSlot.findFirst({ where: { playerId: params.playerToAddId, team: { leagueId: team.leagueId } }, select: { id: true } })
    if (alreadyRostered) throw new Error("Player is already on a league roster")
    if (params.playerToDropId != null) {
      const dropSlot = await tx.rosterSlot.findUnique({
        where: { teamId_playerId: { teamId: params.teamId, playerId: params.playerToDropId } },
        select: { slot: true },
      })
      if (!dropSlot) throw new Error("Dropped player must be on your roster")
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
  const claims = await prisma.waiverClaim.findMany({
    where: { status: ClaimStatus.PENDING, processDate: { lte: now }, team: { leagueId } },
    include: { team: true, playerToAdd: true, playerToDrop: true },
    orderBy: [{ bidAmount: "desc" }, { team: { waiverPriority: "asc" } }, { processDate: "asc" }],
  })
  const claimedPlayers = new Set<number>()
  let processed = 0
  for (const claim of claims) {
    if (claimedPlayers.has(claim.playerToAddId)) continue
    await prisma.$transaction(async (tx) => {
      const team = await tx.team.findUnique({ where: { id: claim.teamId }, select: { leagueId: true, faabBalance: true } })
      if (!team || team.leagueId !== leagueId) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED } })
        return
      }
      if (team.faabBalance < claim.bidAmount) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.INSUFFICIENT_FAAB } })
        return
      }
      const existingAdd = await tx.rosterSlot.findFirst({ where: { playerId: claim.playerToAddId, team: { leagueId } }, select: { id: true } })
      if (existingAdd) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.ALREADY_ROSTERED } })
        return
      }
      if (claim.playerToDropId != null) {
        const dropSlot = await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId: claim.teamId, playerId: claim.playerToDropId } } })
        if (!dropSlot) {
          await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.DROP_MISSING } })
          return
        }
        await tx.rosterSlot.delete({ where: { id: dropSlot.id } })
        await tx.activityLog.create({ data: { leagueId, teamId: claim.teamId, action: ActivityAction.DROP, details: { playerId: claim.playerToDropId, playerName: claim.playerToDrop?.name ?? null } } })
      } else {
        const rosterCount = await tx.rosterSlot.count({ where: { teamId: claim.teamId, slot: { notIn: RESERVE_SLOTS } } })
        const league = await tx.league.findUnique({ where: { id: leagueId }, select: { rosterSize: true } })
        if (!league || rosterCount >= league.rosterSize) {
          await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.ROSTER_FULL } })
          return
        }
      }
      await tx.team.update({ where: { id: claim.teamId }, data: { faabBalance: { decrement: claim.bidAmount } } })
      await tx.rosterSlot.create({ data: { teamId: claim.teamId, playerId: claim.playerToAddId, slot: SlotType.BN } })
      await tx.activityLog.create({ data: { leagueId, teamId: claim.teamId, action: ActivityAction.ADD, details: { playerId: claim.playerToAddId, playerName: claim.playerToAdd.name, bidAmount: claim.bidAmount, outcome: "Won" } } })
      await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.SUCCESSFUL, resolution: WAIVER_RESOLUTIONS.WON } })
      await tx.waiverClaim.updateMany({
        where: { team: { leagueId }, playerToAddId: claim.playerToAddId, status: ClaimStatus.PENDING, processDate: { lte: now }, id: { not: claim.id } },
        data: { status: ClaimStatus.FAILED, resolution: WAIVER_RESOLUTIONS.OUTBID },
      })
      await rotateWaiverPriority(tx, leagueId, claim.teamId)
      claimedPlayers.add(claim.playerToAddId)
      processed += 1
    })
  }
  return processed
}

async function rotateWaiverPriority(tx: TransactionClient, leagueId: string, winnerId: string) {
  const teams = await tx.team.findMany({ where: { leagueId }, orderBy: { waiverPriority: "asc" }, select: { id: true } })
  const ordered = [...teams.filter((team) => team.id !== winnerId), ...teams.filter((team) => team.id === winnerId)]
  for (const [index, team] of ordered.entries()) {
    await tx.team.update({ where: { id: team.id }, data: { waiverPriority: index + 1 } })
  }
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
  if (params.proposingTeamId === params.receivingTeamId) throw new Error("Teams must be different")
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
  return prisma.$transaction(async (tx) => {
    const offer = await tx.tradeOffer.findUnique({ where: { id: tradeOfferId }, include: { assets: true, league: { select: { currentSeason: true, lineupLockMode: true } } } })
    if (!offer || offer.status !== TradeStatus.PENDING) throw new Error("Trade offer is not pending")
    const lock = await getLockSummary(offer.league.currentSeason, offer.league.lineupLockMode)
    if (lock.mode === "WEEKLY" && lock.weekStarted) await freezeWeekLineup(tx, offer.leagueId, offer.league.currentSeason, lock.week)
    const teams = await tx.team.findMany({ where: { id: { in: [offer.proposingTeamId, offer.receivingTeamId] } }, select: { id: true, faabBalance: true } })
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
    return offer
  })
}

const STARTER_ELIGIBILITY: Partial<Record<SlotType, string[]>> = {
  C: ["C"], W: ["LW", "RW"], F: ["C", "LW", "RW"], D: ["D"], G: ["G"],
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
  return positions[slot] ?? 0
}

/**
 * Moves a player to `targetSlot`. If `targetPlayerId` is given (or the slot is full) the two players trade
 * places, so the mover really ends up in `targetSlot`. Every placement is validated for both players.
 */
export async function updateRosterPlacement(teamId: string, playerId: number, targetSlot: SlotType, targetPlayerId?: number, week?: number) {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId, playerId } }, include: { player: true, team: { include: { league: true } } } })
    if (!slot) throw new Error("Player is not on this roster")
    const league = slot.team.league
    const lock = await getLockSummary(league.currentSeason, league.lineupLockMode)
    const selectedWeek = week ?? lock.week
    if (isWeekLineupLocked(lock, selectedWeek)) throw new Error(FUTURE_LINEUP_LOCK_MESSAGE)
    const arrangingFutureWeek = selectedWeek > lock.week
    // An injured (IR-status) starter may always be moved onto IR, even while starters are locked.
    const injuredToIr = slot.player.injuryStatus === "IR" && (targetSlot === SlotType.IR || targetSlot === SlotType.IR_PLUS)
    if (!arrangingFutureWeek && !injuredToIr && (isSlotLocked(lock, slot.slot, slot.player.teamAbbrev) || (lock.mode === "WEEKLY" && isSlotLocked(lock, targetSlot, slot.player.teamAbbrev)))) {
      throw new Error(lock.mode === "WEEKLY" ? "Starting lineups are locked until next week (first game has started)" : "Player's roster slot is locked (their game has started)")
    }
    if (slot.slot === targetSlot) return tx.rosterSlot.findMany({ where: { teamId }, include: { player: true }, orderBy: { slot: "asc" } })
    assertSlotEligible(slot.player, targetSlot, league.taxiMaxGames, slot.player.name)

    const occupants = await tx.rosterSlot.findMany({ where: { teamId, slot: targetSlot, id: { not: slot.id } }, include: { player: true }, orderBy: { id: "asc" } })
    let swapWith = targetPlayerId !== undefined ? await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId, playerId: targetPlayerId } }, include: { player: true } }) : null
    if (targetPlayerId !== undefined && (!swapWith || swapWith.slot !== targetSlot)) throw new Error("The player you are swapping with has moved; refresh and try again")
    if (!swapWith && targetSlot !== SlotType.BN && occupants.length >= slotCapacity(league, targetSlot)) swapWith = occupants[0] ?? null

    if (swapWith) {
      if (!arrangingFutureWeek && (isSlotLocked(lock, swapWith.slot, swapWith.player.teamAbbrev) || isSlotLocked(lock, slot.slot, swapWith.player.teamAbbrev))) throw new Error("The target roster slot is locked")
      // The displaced player takes the mover's old slot, which must also be legal for them.
      assertSlotEligible(swapWith.player, slot.slot, league.taxiMaxGames, swapWith.player.name)
      await tx.rosterSlot.update({ where: { id: slot.id }, data: { slot: targetSlot } })
      await tx.rosterSlot.update({ where: { id: swapWith.id }, data: { slot: slot.slot } })
    } else {
      await tx.rosterSlot.update({ where: { id: slot.id }, data: { slot: targetSlot } })
    }
    return tx.rosterSlot.findMany({ where: { teamId }, include: { player: true }, orderBy: { slot: "asc" } })
  })
}