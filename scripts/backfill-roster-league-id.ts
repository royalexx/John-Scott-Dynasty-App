import { Prisma, PrismaClient } from "@prisma/client"

process.loadEnvFile?.(".env")

const prisma = new PrismaClient()

type RosterRow = {
  id: string
  teamId: string
  leagueId: string | null
  playerId: number
  slot: string
}

async function main() {
  const updated = await prisma.$executeRaw`
    UPDATE "RosterSlot" AS slot
    SET "leagueId" = team."leagueId"
    FROM "Team" AS team
    WHERE slot."teamId" = team.id
      AND slot."leagueId" IS DISTINCT FROM team."leagueId"
  `
  console.log(`Set leagueId from the team on ${updated} roster slot(s).`)

  const rows = await prisma.$queryRaw<RosterRow[]>`
    SELECT
      slot.id::text AS id,
      slot."teamId"::text AS "teamId",
      slot."leagueId"::text AS "leagueId",
      slot."playerId" AS "playerId",
      slot.slot::text AS slot
    FROM "RosterSlot" AS slot
    ORDER BY slot."leagueId", slot."playerId", slot.id
  `

  const groups = new Map<string, RosterRow[]>()
  for (const row of rows) {
    if (!row.leagueId) continue
    const key = `${row.leagueId}:${row.playerId}`
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  let removed = 0
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const [keep, ...duplicates] = group
    console.log(
      `Duplicate player ${keep.playerId} in league ${keep.leagueId}: keeping ${keep.id} (team ${keep.teamId}, ${keep.slot}), removing ${duplicates.map((row) => `${row.id} (team ${row.teamId}, ${row.slot})`).join(", ")}`,
    )
    await prisma.$executeRaw`
      DELETE FROM "RosterSlot"
      WHERE id IN (${Prisma.join(duplicates.map((row) => Prisma.sql`${row.id}::uuid`))})
    `
    removed += duplicates.length
  }
  console.log(`Removed ${removed} duplicate roster slot(s).`)

  const stillMissing = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count FROM "RosterSlot" WHERE "leagueId" IS NULL
  `
  const missingCount = stillMissing[0]?.count ?? 0
  if (missingCount > 0) {
    console.error(`${missingCount} roster slot(s) still have no leagueId.`)
    process.exitCode = 1
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
