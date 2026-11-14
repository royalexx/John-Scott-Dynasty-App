import { expect, test } from "@playwright/test"

test("database-free hosted preview visibly labels demonstration data", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("preview-fixture-banner")).toContainText("SAMPLE DATA · READ ONLY")
  await expect(page.getByRole("heading", { name: "JOHN SCOTT DYNASTY" })).toBeVisible()
  await page.getByRole("button", { name: "PLAYERS", exact: true }).click()
  await expect(page.getByText("Macklin Celebrini").first()).toBeVisible()
  await page.getByRole("button", { name: "TEAM", exact: true }).click()
  await expect(page.getByText("Nathan MacKinnon").first()).toBeVisible()
  const src = await page.locator("main img").first().getAttribute("src")
  expect(src).toMatch(/\/api\/headshot|assets\.nhle\.com/)
})

test("preview never allows a write or a mutating GET", async ({ request }) => {
  for (const [method, url] of [
    ["POST", "/api/trades"],
    ["PATCH", "/api/admin/league-settings"],
    ["POST", "/api/roster/move"],
    ["POST", "/api/waivers"],
    ["POST", "/api/draft"],
  ] as const) {
    const response = await request.fetch(url, { method, data: {} })
    expect(response.status(), method + " " + url).toBe(403)
  }
  for (const url of ["/api/cron/sync", "/api/cron/waivers", "/api/draft?ensure=1"]) {
    const response = await request.get(url)
    expect(response.status(), url).toBe(403)
  }
})

test("preview fixture GET endpoints do not rely on PostgreSQL", async ({ request }) => {
  const players = await request.get("/api/players")
  expect(players.ok()).toBe(true)
  expect((await players.json()).length).toBeGreaterThan(0)

  const draft = await request.get("/api/draft")
  expect(draft.ok()).toBe(true)
  expect(await draft.json()).toEqual({ scheduled: null, draft: null })

  const league = await request.get("/api/admin/league-settings")
  expect(league.ok()).toBe(true)
  expect((await league.json()).name).toContain("Demo")
})
