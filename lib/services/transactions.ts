import { ActivityAction, AssetType, ClaimStatus, PlayerStatus, Prisma, SlotType, TradeStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"

type TransactionClient = Prisma.TransactionClient
const nonActiveSlots = new Set<SlotType>([SlotType.TAXI, SlotType.IR, SlotType.IR_PLUS])
const injuredStatuses = new Set<PlayerStatus>([PlayerStatus.IR, PlayerStatus.O, PlayerStatus.DTD])

export interface SubmitWaiverClaimParams {
  teamId: string
  playerToAddId: number
  playerToDropId?: number | null
  bidAmount: number
  processDate: Date
}

export async function submitWaiverClaim(params: SubmitWaiverClaimParams) {
  if (!Number.isInteger(params.bidAmount) || params.bidAmount < 0) throw new Error("Bid amount must be a non-negative integer")
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: params.teamId }, select: { leagueId: true, faabBalance: true } })
    if (!team) throw new Error("Team not found")
    if (team.faabBalance < params.bidAmount) throw new Error("Insufficient FAAB balance")

    const addPlayer = await tx.player.findUnique({ where: { id: params.playerToAddId }, select: { id: true } })
    if (!addPlayer) throw new Error("Player to add not found")
    if (params.playerToDropId != null) {
      const dropSlot = await tx.rosterSlot.findUnique({
        where: { teamId_playerId: { teamId: params.teamId, playerId: params.playerToDropId } },
        select: { slot: true },
      })
      if (!dropSlot || nonActiveSlots.has(dropSlot.slot)) {
        throw new Error("Dropped player must be on the active roster")
      }
    }
    return tx.waiverClaim.create({
      data: {
        teamId: params.teamId,
        playerToAddId: params.playerToAddId,
        playerToDropId: params.playerToDropId ?? null,
        bidAmount: params.bidAmount,
        processDate: params.processDate,
      },
      include: { playerToAdd: true, playerToDrop: true },
    })
  })
}

export async function processWaiversForLeague(leagueId: string) {
  const claims = await prisma.waiverClaim.findMany({
    where: { status: ClaimStatus.PENDING, team: { leagueId } },
    include: { team: true, playerToAdd: true, playerToDrop: true },
    orderBy: [{ bidAmount: "desc" }, { team: { waiverPriority: "asc" } }, { processDate: "asc" }],
  })
  const claimedPlayers = new Set<number>()
  let processed = 0
  for (const claim of claims) {
    if (claimedPlayers.has(claim.playerToAddId)) continue
    await prisma.$transaction(async (tx) => {
      const team = await tx.team.findUnique({ where: { id: claim.teamId }, select: { leagueId: true, faabBalance: true } })
      if (!team || team.leagueId !== leagueId || team.faabBalance < claim.bidAmount) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED } })
        return
      }
      const existingAdd = await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId: claim.teamId, playerId: claim.playerToAddId } } })
      if (existingAdd) {
        await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED } })
        return
      }
      if (claim.playerToDropId != null) {
        const dropSlot = await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId: claim.teamId, playerId: claim.playerToDropId } } })
        if (!dropSlot || nonActiveSlots.has(dropSlot.slot)) {
          await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.FAILED } })
          return
        }
        await tx.rosterSlot.delete({ where: { id: dropSlot.id } })
        await tx.activityLog.create({ data: { leagueId, teamId: claim.teamId, action: ActivityAction.DROP, details: { playerId: claim.playerToDropId, playerName: claim.playerToDrop?.name ?? null } } })
      }
      await tx.team.update({ where: { id: claim.teamId }, data: { faabBalance: { decrement: claim.bidAmount } } })
      await tx.rosterSlot.create({ data: { teamId: claim.teamId, playerId: claim.playerToAddId, slot: SlotType.BN } })
      await tx.activityLog.create({ data: { leagueId, teamId: claim.teamId, action: ActivityAction.ADD, details: { playerId: claim.playerToAddId, playerName: claim.playerToAdd.name, bidAmount: claim.bidAmount } } })
      await tx.waiverClaim.update({ where: { id: claim.id }, data: { status: ClaimStatus.SUCCESSFUL } })
      await tx.waiverClaim.updateMany({ where: { team: { leagueId }, playerToAddId: claim.playerToAddId, status: ClaimStatus.PENDING, id: { not: claim.id } }, data: { status: ClaimStatus.FAILED } })
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
    const offer = await tx.tradeOffer.findUnique({ where: { id: tradeOfferId }, include: { assets: true } })
    if (!offer || offer.status !== TradeStatus.PENDING) throw new Error("Trade offer is not pending")
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

export async function updateRosterPlacement(teamId: string, playerId: number, targetSlot: SlotType) {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.rosterSlot.findUnique({ where: { teamId_playerId: { teamId, playerId } }, include: { player: true, team: { include: { league: true } } } })
    if (!slot) throw new Error("Player is not on this roster")
    if (slot.lockedAt) throw new Error("Player's roster slot is locked")
    if (targetSlot === SlotType.TAXI && slot.player.nhlGamesPlayed > slot.team.league.taxiMaxGames) throw new Error("Player is not eligible for the taxi squad")
    if ((targetSlot === SlotType.IR || targetSlot === SlotType.IR_PLUS) && !injuredStatuses.has(slot.player.injuryStatus)) throw new Error("Player is not eligible for injured reserve")

    const target = await tx.rosterSlot.findFirst({ where: { teamId, slot: targetSlot, id: { not: slot.id } }, orderBy: { id: "asc" } })
    if (target && target.lockedAt) throw new Error("The target roster slot is locked")
    if (target) {
      await tx.rosterSlot.update({ where: { id: slot.id }, data: { slot: SlotType.BN } })
      await tx.rosterSlot.update({ where: { id: target.id }, data: { slot: slot.slot } })
    } else {
      await tx.rosterSlot.update({ where: { id: slot.id }, data: { slot: targetSlot } })
    }
    return tx.rosterSlot.findMany({ where: { teamId }, include: { player: true }, orderBy: { slot: "asc" } })
  })
}
