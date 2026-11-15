-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('C', 'LW', 'RW', 'D', 'G');

-- CreateEnum
CREATE TYPE "SlotType" AS ENUM ('C', 'W', 'F', 'D', 'G', 'BN', 'TAXI', 'IR', 'IR_PLUS');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('HEALTHY', 'DTD', 'O', 'IR');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'PROCESSED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('ADD', 'DROP', 'TRADE', 'COMMISSIONER');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('PLAYER', 'PICK', 'FAAB');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "isCommissioner" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currentSeason" INTEGER NOT NULL,
    "currentWeek" INTEGER NOT NULL,
    "rosterSize" INTEGER NOT NULL,
    "taxiSlots" INTEGER NOT NULL,
    "irSlots" INTEGER NOT NULL,
    "taxiMaxGames" INTEGER NOT NULL DEFAULT 50,
    "lineupLockMode" TEXT NOT NULL DEFAULT 'WEEKLY',
    "scoringSettings" JSONB NOT NULL,
    "rosterPositions" JSONB,
    "waiverSettings" JSONB,
    "tradeSettings" JSONB,
    "draftSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "managerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "faabBalance" INTEGER NOT NULL DEFAULT 100,
    "waiverPriority" INTEGER NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "teamAbbrev" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "secondaryPosition" "Position",
    "nhlGamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "injuryStatus" "PlayerStatus" NOT NULL DEFAULT 'HEALTHY',
    "headshotUrl" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterSlot" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "playerId" INTEGER NOT NULL,
    "slot" "SlotType" NOT NULL,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "RosterSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekLineup" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "slot" "SlotType" NOT NULL,

    CONSTRAINT "WeekLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "rounds" INTEGER NOT NULL,
    "timerSeconds" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "onClock" INTEGER NOT NULL DEFAULT 0,
    "clockStartedAt" TIMESTAMP(3),
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pausedRemaining" INTEGER,
    "queues" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftSlot" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "teamId" UUID NOT NULL,
    "playerId" INTEGER,
    "pickedAt" TIMESTAMP(3),

    CONSTRAINT "DraftSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "originalTeamId" UUID NOT NULL,
    "currentTeamId" UUID NOT NULL,
    "notes" TEXT,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOffer" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "proposingTeamId" UUID NOT NULL,
    "receivingTeamId" UUID NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeAsset" (
    "id" UUID NOT NULL,
    "tradeOfferId" UUID NOT NULL,
    "fromTeamId" UUID NOT NULL,
    "toTeamId" UUID NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "playerId" INTEGER,
    "draftPickId" UUID,
    "faabAmount" INTEGER,

    CONSTRAINT "TradeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiverClaim" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "playerToAddId" INTEGER NOT NULL,
    "playerToDropId" INTEGER,
    "bidAmount" INTEGER NOT NULL,
    "processDate" TIMESTAMP(3) NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,

    CONSTRAINT "WaiverClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "teamId" UUID,
    "action" "ActivityAction" NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueMessage" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matchup" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "homeTeamId" UUID NOT NULL,
    "awayTeamId" UUID NOT NULL,
    "homeScore" DECIMAL(10,2),
    "awayScore" DECIMAL(10,2),
    "homePoints" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "awayPoints" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Matchup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NhlGame" (
    "id" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "gameDate" TEXT NOT NULL,
    "startTimeUTC" TIMESTAMP(3) NOT NULL,
    "homeTeamAbbrev" TEXT NOT NULL,
    "awayTeamAbbrev" TEXT NOT NULL,
    "gameState" TEXT NOT NULL,
    "period" INTEGER,
    "clock" TEXT,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NhlGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerGameStat" (
    "id" UUID NOT NULL,
    "playerId" INTEGER NOT NULL,
    "gameId" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "blocks" INTEGER NOT NULL DEFAULT 0,
    "pim" INTEGER NOT NULL DEFAULT 0,
    "plusMinus" INTEGER NOT NULL DEFAULT 0,
    "powerPlayPoints" INTEGER NOT NULL DEFAULT 0,
    "shorthandedGoals" INTEGER NOT NULL DEFAULT 0,
    "gameWinningGoals" INTEGER NOT NULL DEFAULT 0,
    "toi" TEXT NOT NULL DEFAULT '0:00',
    "shotsAgainst" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shutouts" INTEGER NOT NULL DEFAULT 0,
    "savePct" DOUBLE PRECISION,
    "decision" TEXT,
    "fantasyPoints" DOUBLE PRECISION NOT NULL DEFAULT 0.0,

    CONSTRAINT "PlayerGameStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE INDEX "Team_leagueId_idx" ON "Team"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_leagueId_managerId_key" ON "Team"("leagueId", "managerId");

-- CreateIndex
CREATE INDEX "Player_teamAbbrev_idx" ON "Player"("teamAbbrev");

-- CreateIndex
CREATE INDEX "Player_injuryStatus_idx" ON "Player"("injuryStatus");

-- CreateIndex
CREATE INDEX "RosterSlot_playerId_idx" ON "RosterSlot"("playerId");

-- CreateIndex
CREATE INDEX "RosterSlot_teamId_slot_idx" ON "RosterSlot"("teamId", "slot");

-- CreateIndex
CREATE INDEX "RosterSlot_leagueId_slot_idx" ON "RosterSlot"("leagueId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "RosterSlot_teamId_playerId_key" ON "RosterSlot"("teamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterSlot_leagueId_playerId_key" ON "RosterSlot"("leagueId", "playerId");

-- CreateIndex
CREATE INDEX "WeekLineup_season_week_idx" ON "WeekLineup"("season", "week");

-- CreateIndex
CREATE INDEX "WeekLineup_teamId_season_week_idx" ON "WeekLineup"("teamId", "season", "week");

-- CreateIndex
CREATE UNIQUE INDEX "WeekLineup_teamId_season_week_playerId_key" ON "WeekLineup"("teamId", "season", "week", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_leagueId_key" ON "Draft"("leagueId");

-- CreateIndex
CREATE INDEX "Draft_leagueId_status_idx" ON "Draft"("leagueId", "status");

-- CreateIndex
CREATE INDEX "DraftSlot_draftId_round_idx" ON "DraftSlot"("draftId", "round");

-- CreateIndex
CREATE INDEX "DraftSlot_teamId_idx" ON "DraftSlot"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSlot_draftId_pickNumber_key" ON "DraftSlot"("draftId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSlot_draftId_playerId_key" ON "DraftSlot"("draftId", "playerId");

-- CreateIndex
CREATE INDEX "DraftPick_currentTeamId_season_idx" ON "DraftPick"("currentTeamId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_leagueId_season_round_originalTeamId_key" ON "DraftPick"("leagueId", "season", "round", "originalTeamId");

-- CreateIndex
CREATE INDEX "TradeOffer_leagueId_status_idx" ON "TradeOffer"("leagueId", "status");

-- CreateIndex
CREATE INDEX "TradeAsset_tradeOfferId_idx" ON "TradeAsset"("tradeOfferId");

-- CreateIndex
CREATE INDEX "WaiverClaim_teamId_processDate_idx" ON "WaiverClaim"("teamId", "processDate");

-- CreateIndex
CREATE INDEX "WaiverClaim_teamId_status_idx" ON "WaiverClaim"("teamId", "status");

-- CreateIndex
CREATE INDEX "WaiverClaim_status_bidAmount_idx" ON "WaiverClaim"("status", "bidAmount");

-- CreateIndex
CREATE INDEX "WaiverClaim_status_processDate_idx" ON "WaiverClaim"("status", "processDate");

-- CreateIndex
CREATE INDEX "ActivityLog_leagueId_createdAt_idx" ON "ActivityLog"("leagueId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_recipientId_createdAt_idx" ON "DirectMessage"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_recipientId_readAt_idx" ON "DirectMessage"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "DirectMessage_senderId_recipientId_createdAt_idx" ON "DirectMessage"("senderId", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "LeagueMessage_leagueId_createdAt_idx" ON "LeagueMessage"("leagueId", "createdAt");

-- CreateIndex
CREATE INDEX "Matchup_leagueId_season_week_idx" ON "Matchup"("leagueId", "season", "week");

-- CreateIndex
CREATE UNIQUE INDEX "Matchup_leagueId_season_week_homeTeamId_awayTeamId_key" ON "Matchup"("leagueId", "season", "week", "homeTeamId", "awayTeamId");

-- CreateIndex
CREATE INDEX "NhlGame_gameDate_idx" ON "NhlGame"("gameDate");

-- CreateIndex
CREATE INDEX "NhlGame_gameState_idx" ON "NhlGame"("gameState");

-- CreateIndex
CREATE INDEX "NhlGame_gameDate_gameState_idx" ON "NhlGame"("gameDate", "gameState");

-- CreateIndex
CREATE INDEX "NhlGame_startTimeUTC_idx" ON "NhlGame"("startTimeUTC");

-- CreateIndex
CREATE INDEX "PlayerGameStat_gameId_idx" ON "PlayerGameStat"("gameId");

-- CreateIndex
CREATE INDEX "PlayerGameStat_playerId_idx" ON "PlayerGameStat"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameStat_playerId_gameId_key" ON "PlayerGameStat"("playerId", "gameId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekLineup" ADD CONSTRAINT "WeekLineup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekLineup" ADD CONSTRAINT "WeekLineup_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSlot" ADD CONSTRAINT "DraftSlot_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSlot" ADD CONSTRAINT "DraftSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSlot" ADD CONSTRAINT "DraftSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_originalTeamId_fkey" FOREIGN KEY ("originalTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_currentTeamId_fkey" FOREIGN KEY ("currentTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_proposingTeamId_fkey" FOREIGN KEY ("proposingTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_receivingTeamId_fkey" FOREIGN KEY ("receivingTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_draftPickId_fkey" FOREIGN KEY ("draftPickId") REFERENCES "DraftPick"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_playerToAddId_fkey" FOREIGN KEY ("playerToAddId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_playerToDropId_fkey" FOREIGN KEY ("playerToDropId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMessage" ADD CONSTRAINT "LeagueMessage_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMessage" ADD CONSTRAINT "LeagueMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "NhlGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
