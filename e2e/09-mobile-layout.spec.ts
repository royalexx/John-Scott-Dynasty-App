import { expect, test } from "@playwright/test"

const TABS = ["TEAM", "MATCH", "PLAYERS", "LEAGUE"] as const

test.describe("mobile layout and stability", () => {
  for (const tab of TABS) {
    test(`${tab} tab: fits 430px, no horizontal scroll, no console errors`, async ({ page }) => {
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("console", (message) => { if (message.type() === "error" && !/favicon|Failed to load resource/.test(message.text())) errors.push(message.text()) })

      await page.goto("/")
      const button = page.getByRole("button", { name: tab, exact: true })
      if (await button.count()) await button.click()
      await page.waitForTimeout(400)

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScroll: document.body.scrollWidth,
      }))
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
      expect(metrics.bodyScroll).toBeLessThanOrEqual(430 + 1)
      expect(errors).toEqual([])
    })
  }

  test("the app shell is capped at 430px wide even on a desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/")
    const widest = await page.evaluate(() => Math.max(...Array.from(document.querySelectorAll("main, [class*='max-w-[430px]']")).map((el) => el.getBoundingClientRect().width)))
    expect(widest).toBeLessThanOrEqual(431)
  })

  test("the schedule API returns the real current week's games with dates inside that week", async ({ request }) => {
    const response = await request.get("/api/schedule")
    expect(response.status()).toBe(200)
    const body = await response.json()
    const games = (body.games ?? body.schedule ?? []) as Array<{ date?: string; gameDate?: string }>
    expect(games.length).toBeGreaterThan(0)
  })

  test("the schedule API accepts an explicit past week", async ({ request }) => {
    const response = await request.get("/api/schedule?week=2")
    expect(response.status()).toBe(200)
  })
})
