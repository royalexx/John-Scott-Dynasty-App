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

for (const endpoint of ["/api/cron/sync", "/api/cron/waivers"]) {
  test(`${endpoint} accepts the configured query secret`, async ({ request }) => {
    test.setTimeout(120_000)
    const response = await request.get(`${endpoint}?secret=super-secret-hockey-key-123`)
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({ success: true }))
  })
}
