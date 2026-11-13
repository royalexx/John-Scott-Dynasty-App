-- Additive, empty-by-default storage for independently saved future-week lineups.
-- No historical records are backfilled, and no live RosterSlot is modified.
CREATE TABLE "LineupPlan" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LineupPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LineupPlanEntry" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "playerId" INTEGER NOT NULL,
    "slot" "SlotType" NOT NULL,
    CONSTRAINT "LineupPlanEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineupPlan_teamId_season_week_key" ON "LineupPlan"("teamId", "season", "week");
CREATE INDEX "LineupPlan_season_week_status_idx" ON "LineupPlan"("season", "week", "status");
CREATE UNIQUE INDEX "LineupPlanEntry_planId_playerId_key" ON "LineupPlanEntry"("planId", "playerId");
CREATE INDEX "LineupPlanEntry_playerId_idx" ON "LineupPlanEntry"("playerId");

ALTER TABLE "LineupPlan" ADD CONSTRAINT "LineupPlan_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineupPlanEntry" ADD CONSTRAINT "LineupPlanEntry_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LineupPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineupPlanEntry" ADD CONSTRAINT "LineupPlanEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
