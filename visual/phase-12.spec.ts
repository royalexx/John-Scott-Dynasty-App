import { expect, test, type Page, type TestInfo } from "@playwright/test"

const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true })

async function attachMetrics(page: Page, info: TestInfo, width: number) {
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    const paint = performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint")
    return {
      dclMs: navigation?.domContentLoadedEventEnd ?? null,
      fcpMs: paint?.startTime ?? null,
      resourceCount: performance.getEntriesByType("resource").length,
      portraitCount: document.querySelectorAll('[data-slot="player-portrait"] img').length,
      domNodes: document.querySelectorAll("*").length,
      viewport: document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1)
  await info.attach(`phase-12-metrics-${width}.json`, {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  })
}

for (const width of [320, 390]) {
  test(`Phase 12: retained Match/Team UI, lazy NHL portraits and no writes at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    const writes: string[] = []
    page.on("request", (request) => {
      if (request.method() !== "GET" && /\/api\//.test(request.url())) writes.push(request.url())
    })
    await page.goto("/")
    await expect(page.getByTestId("preview-fixture-banner")).toContainText("READ ONLY")
    await tab(page, "MATCH").click()
    await expect(page.getByRole("button", { name: "Previous scoring week" })).toBeVisible()
    await tab(page, "TEAM").click()
    const portraits = page.locator('[data-slot="player-portrait"] img')
    await expect(portraits.first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
    await expect(portraits.first()).toHaveAttribute("loading", "lazy")
    await expect(portraits.first()).toHaveAttribute("decoding", "async")
    await tab(page, "LEAGUE").click()
    await expect(page.getByTestId("league-feed")).toBeVisible()
    await tab(page, "TEAM").click()
    await attachMetrics(page, info, width)
    expect(writes).toEqual([])
    const shot = info.outputPath(`phase-12-retained-team-${width}.png`)
    await page.screenshot({ path: shot, animations: "disabled" })
    await info.attach(`phase-12-retained-team-${width}`, { path: shot, contentType: "image/png" })
  })

  test(`Phase 12: indexed NHL search keeps matching behavior at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    const writes: string[] = []
    page.on("request", (request) => {
      if (request.method() !== "GET" && /\/api\//.test(request.url())) writes.push(request.url())
    })
    await page.goto("/")
    await tab(page, "PLAYERS").click()
    await page.getByRole("navigation", { name: "Player market sections" }).getByRole("button", { name: "Search" }).click()
    const search = page.getByRole("textbox", { name: "Search NHL players" })
    const results = page.getByTestId("player-search-results")
    await search.fill("celebrini")
    await expect(results.getByText("Macklin Celebrini")).toBeVisible()
    await search.fill("CÉLEBRINI")
    await expect(results.getByText("Macklin Celebrini")).toBeVisible()
    await search.fill("stankoven")
    await expect(results.getByText("Logan Stankoven")).toBeVisible()
    await search.fill("not-a-player-xyz")
    await expect(page.getByText(/No players found matching/)).toBeVisible()
    await page.getByRole("button", { name: "Clear search" }).click()
    await expect(search).toHaveValue("")
    await expect(results.getByRole("button").first()).toBeVisible()
    expect(writes).toEqual([])
    await attachMetrics(page, info, width)
  })
}
