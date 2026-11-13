-- Additive game-specific lineup evidence for DAILY mode. No historical backfill.
-- Snapshots are written once for each fantasy team/game, even for empty rosters.
CREATE TABLE "DailyGameLineup" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "gameId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyGameLineup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyGameLineupEntry" (
    "id" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "playerId" INTEGER NOT NULL,
    "slot" "SlotType" NOT NULL,
    CONSTRAINT "DailyGameLineupEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyGameLineup_teamId_gameId_key" ON "DailyGameLineup"("teamId", "gameId");
CREATE INDEX "DailyGameLineup_season_week_idx" ON "DailyGameLineup"("season", "week");
CREATE INDEX "DailyGameLineup_gameId_idx" ON "DailyGameLineup"("gameId");
CREATE UNIQUE INDEX "DailyGameLineupEntry_snapshotId_playerId_key" ON "DailyGameLineupEntry"("snapshotId", "playerId");
CREATE INDEX "DailyGameLineupEntry_playerId_idx" ON "DailyGameLineupEntry"("playerId");

ALTER TABLE "DailyGameLineup" ADD CONSTRAINT "DailyGameLineup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyGameLineup" ADD CONSTRAINT "DailyGameLineup_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "NhlGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyGameLineupEntry" ADD CONSTRAINT "DailyGameLineupEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "DailyGameLineup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyGameLineupEntry" ADD CONSTRAINT "DailyGameLineupEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
