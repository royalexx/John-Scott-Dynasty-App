import { expect, test } from "@playwright/test"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
test.afterAll(async () => { await prisma.$disconnect() })

test("schedule API returns the expected shape", async ({ request }) => {
  const response = await request.get("/api/schedule")
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toEqual(expect.objectContaining({
    date: expect.any(String),
    games: expect.any(Array),
    weekGames: expect.any(Array),
    playerGameLogs: expect.any(Object),
  }))
})

test("players API returns players", async ({ request }) => {
  const response = await request.get("/api/players")
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(Array.isArray(body)).toBe(true)
  expect(body.length).toBeGreaterThan(0)
})

test("cron routes reject URL credentials without executing jobs", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  })
  // Use a dummy value: never place a real secret in a test request URL.
  const querySecret = "legacy-query-only-test-token"
  for (const endpoint of ["/api/cron/sync", "/api/cron/waivers"]) {
    const response = await anonymous.get(`${endpoint}?secret=${querySecret}`)
    expect(response.status()).toBe(403)
  }
  await anonymous.dispose()
})

// Deliberately does NOT run waivers: that processes real pending claims in the shared database.
for (const endpoint of ["/api/cron/waivers", "/api/trades"]) {
  test(`${endpoint} rejects unauthenticated mutation`, async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
    const response = endpoint === "/api/trades"
      ? await anonymous.patch(endpoint, { data: { tradeOfferId: "00000000-0000-0000-0000-000000000000", action: "REJECT" } })
      : await anonymous.get(endpoint)
    expect([401, 403]).toContain(response.status())
    await anonymous.dispose()
  })
}
test("failed manager PIN attempts are limited across requests", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "x-forwarded-for": "198.51.100.72" },
  })
  const data = { managerId: "11111111-1111-4111-8111-111111111112", pin: "9999" }
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await anonymous.post("/api/auth/login", { data })
      expect(response.status()).toBe(401)
    }
    const limited = await anonymous.post("/api/auth/login", { data })
    expect(limited.status()).toBe(429)
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0)
  } finally {
    await anonymous.dispose()
  }
})

test("FAAB trades cannot spend budget committed to pending waivers", async ({ request }) => {
  const source = await prisma.team.findFirstOrThrow({ where: { faabBalance: { gt: 0 } }, orderBy: { name: "asc" } })
  const destination = await prisma.team.findFirstOrThrow({ where: { leagueId: source.leagueId, id: { not: source.id } } })
  const available = await prisma.player.findFirstOrThrow({ where: { rosterSlots: { none: { leagueId: source.leagueId } } } })
  const originalBalances = await prisma.team.findMany({
    where: { id: { in: [source.id, destination.id] } },
    orderBy: { id: "asc" },
    select: { id: true, faabBalance: true },
  })
  const claim = await prisma.waiverClaim.create({
    data: {
      teamId: source.id,
      playerToAddId: available.id,
      bidAmount: source.faabBalance,
      processDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })
  let tradeId: string | null = null
  try {
    const trade = await prisma.tradeOffer.create({
      data: {
        leagueId: source.leagueId,
        proposingTeamId: source.id,
        receivingTeamId: destination.id,
        assets: { create: { fromTeamId: source.id, toTeamId: destination.id, assetType: "FAAB", faabAmount: 1 } },
      },
    })
    tradeId = trade.id
    const response = await request.patch("/api/trades", { data: { tradeOfferId: trade.id, action: "ACCEPT" } })
    expect(response.status()).toBe(400)
    expect((await response.json()).error).toMatch(/reserved for pending waiver claims/i)
    expect((await prisma.tradeOffer.findUniqueOrThrow({ where: { id: trade.id } })).status).toBe("PENDING")
    expect(await prisma.team.findMany({
      where: { id: { in: [source.id, destination.id] } },
      orderBy: { id: "asc" },
      select: { id: true, faabBalance: true },
    })).toEqual(originalBalances)
    expect((await prisma.waiverClaim.findUniqueOrThrow({ where: { id: claim.id } })).status).toBe("PENDING")
  } finally {
    if (tradeId) await prisma.tradeOffer.delete({ where: { id: tradeId } })
    await prisma.waiverClaim.delete({ where: { id: claim.id } })
  }
})
