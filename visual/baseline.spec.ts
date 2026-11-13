import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { marketPlayers, activities } from "../lib/hockey-data"

// Screenshots are illustrative snapshots from deterministic fixtures, NOT live league data.
// All browser API writes are intercepted and rejected, even in local fixture mode.
async function installReadOnlyFixtures(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() !== "GET") {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Visual fixtures are read-only" }),
      })
      return
    }
    // Headshot redirects are read-only and resolve to actual NHL player photography.
    if (path === "/api/headshot") {
      await route.continue()
      return
    }
    const response: Record<string, unknown> = {
      "/api/schedule": { date: "2026-11-13", games: [], weekGames: [], playerGameLogs: {} },
      "/api/players": marketPlayers,
      "/api/messages": [],
      "/api/trades": { offers: [], picks: [], teams: [] },
      "/api/activity": { activities },
      "/api/draft": { scheduled: null, draft: null },
      "/api/waivers": { faabBalance: 100, committedFaab: 0, claims: [] },
      "/api/news": { articles: [] },
      "/api/admin/league-settings": { name: "John Scott Dynasty", rosterSize: 27 },
      "/api/admin/roles": { managers: [] },
    }
    if (!(path in response)) {
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response[path]),
    })
  })
}

async function saveScreenshot(page: Page, info: TestInfo, name: string) {
  const destination = info.outputPath(name + ".png")
  await page.screenshot({ path: destination, animations: "disabled", caret: "hide" })
  await info.attach(name, { path: destination, contentType: "image/png" })
}

const viewports = [
  { width: 320, height: 700 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]

for (const viewport of viewports) {
  test("mobile baseline " + viewport.width + "px — four primary tabs", async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await installReadOnlyFixtures(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "JOHN SCOTT DYNASTY" })).toBeVisible()

    const measurements: Array<Record<string, number | string>> = []
    for (const tab of ["MATCH", "TEAM", "PLAYERS", "LEAGUE"] as const) {
      const button = page.getByRole("button", { name: tab, exact: true })
      await button.click()
      await expect(button).toBeVisible()
      await page.waitForTimeout(350) // Wait for the existing swipe spring to settle.
      const dims = await page.evaluate(() => {
        const shell = document.querySelector("main")
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          shellWidth: shell?.getBoundingClientRect().width ?? 0,
        }
      })
      expect(dims.shellWidth).toBeLessThanOrEqual(431)
      measurements.push({ screen: tab, ...dims })
      await saveScreenshot(page, info, "baseline-" + viewport.width + "-" + tab.toLowerCase())
    }
    await info.attach("layout-measurements-" + viewport.width, {
      body: JSON.stringify(measurements, null, 2),
      contentType: "application/json",
    })
  })
}

test("desktop shell stays phone-width at 1280px", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installReadOnlyFixtures(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "JOHN SCOTT DYNASTY" })).toBeVisible()
  const width = await page.locator("main").first().evaluate((element) => element.getBoundingClientRect().width)
  expect(width).toBeLessThanOrEqual(431)
  await saveScreenshot(page, info, "baseline-desktop-shell")
})

test("portrait source, player detail, chat and settings baselines", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installReadOnlyFixtures(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "JOHN SCOTT DYNASTY" })).toBeVisible()
  await page.getByRole("button", { name: "TEAM", exact: true }).click()

  // Do not replace genuine portrait tags with purely decorative symbols.
  // Source loading itself depends on NHL CDN availability and is not asserted.
  const portraitSrc = await page.locator("main button img").first().getAttribute("src")
  expect(portraitSrc).toMatch(/\/api\/headshot|assets\.nhle\.com/)
  await saveScreenshot(page, info, "baseline-portrait-roster")

  const player = page.locator("button").filter({ hasText: "Nathan MacKinnon" }).first()
  await player.click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await saveScreenshot(page, info, "baseline-player-detail")
  await page.getByRole("button", { name: "Close player" }).click()

  await page.getByRole("button", { name: "League & Team Settings" }).click()
  await saveScreenshot(page, info, "baseline-settings-drawer")
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Open league chat" }).click()
  await saveScreenshot(page, info, "baseline-chat-drawer")
})

test("PIN picker and PIN entry have screenshot fixtures", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installReadOnlyFixtures(page)
  await page.goto("/ui-visual-baseline")
  await expect(page.getByRole("heading", { name: "Manager Access" })).toBeVisible()
  await saveScreenshot(page, info, "baseline-pin-team-picker")
  await page.getByRole("button", { name: /Montreal Monarchs/ }).click()
  await saveScreenshot(page, info, "baseline-pin-entry")
})
