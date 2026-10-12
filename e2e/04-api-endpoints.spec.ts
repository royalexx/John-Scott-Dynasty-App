import { expect, test } from "@playwright/test"

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

test("/api/cron/sync accepts the configured query secret", async ({ request }) => {
  test.setTimeout(120_000)
  const response = await request.get("/api/cron/sync?secret=super-secret-hockey-key-123")
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual(expect.objectContaining({ success: true }))
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