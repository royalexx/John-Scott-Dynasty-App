import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { MAX_FANTASY_WEEK } from "../lib/season-calendar"

const matchTab = (page: Page) =>
  page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "MATCH", exact: true })

const touch44 = async (locator: import("@playwright/test").Locator) => {
  const rect = await locator.boundingBox()
  expect(rect?.width ?? 0).toBeGreaterThanOrEqual(43.99)
  expect(rect?.height ?? 0).toBeGreaterThanOrEqual(43.99)
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.waitForTimeout(250)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, animations: "disabled", caret: "hide" })
  await info.attach(name, { path, contentType: "image/png" })
}

for (const width of [320, 390, 430]) {
  test(`Phase 11: compact matchup portraits, score labels and read-only past weeks at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : width === 390 ? 844 : 932 })
    const writes: string[] = []
    page.on("request", request => {
      if (request.method() !== "GET" && /\/api\//.test(request.url())) writes.push(request.url())
    })
    await page.goto("/")
    await matchTab(page).click()
    const starters = page.getByTestId("matchup-starters")
    await expect(starters).toBeVisible()
    const home = starters.getByTestId("home-player").filter({ has: page.locator('[data-slot="player-portrait"] img') })
    const away = starters.getByTestId("away-player").filter({ has: page.locator('[data-slot="player-portrait"] img') })
    await expect(home.first()).toBeVisible()
    await expect(away.first()).toBeVisible()
    await expect(home.first().locator('[data-slot="player-portrait"] img')).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
    await expect(away.first().locator('[data-slot="player-portrait"] img')).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)

    const points = starters.getByTestId("matchup-player-points")
    expect(await points.count()).toBeGreaterThan(0)
    await expect(points.first()).toContainText("Actual")
    await expect(points.first()).toContainText("Proj.")
    await expect(page.getByText("Actual points").first()).toBeVisible()

    const prev = starters.getByRole("button", { name: "Previous scoring week" })
    const next = starters.getByRole("button", { name: "Next scoring week" })
    await touch44(prev)
    await touch44(next)
    const matchPrev = page.getByRole("button", { name: "Previous matchup" })
    const matchNext = page.getByRole("button", { name: "Next matchup" })
    await touch44(matchPrev)
    await touch44(matchNext)

    const edit = starters.getByRole("button", { name: /^Edit .* in (C|W|F|D|G) matchup slot$/ }).first()
    await expect(edit).toBeVisible()
    await touch44(edit)
    await capture(page, info, `phase-11-matchup-${width}`)
    await edit.click()
    const dialog = page.getByRole("dialog").last()
    await expect(dialog.getByRole("heading", { name: "Swap Player" })).toBeVisible()
    await dialog.getByRole("button", { name: "Close swap player drawer" }).click()

    const week = starters.locator('span[role="status"]').filter({ hasText: /^Week [0-9]+$/ })
    const current = Number((await week.textContent())?.match(/[0-9]+/)?.[0] ?? "0")
    expect(current).toBeGreaterThan(1)
    await prev.click()
    await expect(week).toHaveText(`Week ${current - 1}`)
    await expect(page.getByTestId("matchup-readonly-notice")).toContainText("Past week")
    const disabled = starters.getByRole("button", { name: /matchup slot is read only/ }).first()
    await expect(disabled).toBeDisabled()
    await capture(page, info, `phase-11-historical-lock-${width}`)

    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(scroll).toBeLessThanOrEqual(1)
    expect(writes).toEqual([])
  })
}

test("Phase 11: Match scoring week controls stop at week 1 and week 24 without API mutations", async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const writes: string[] = []
  page.on("request", request => {
    if (request.method() !== "GET" && /\/api\//.test(request.url())) writes.push(request.url())
  })
  await page.goto("/")
  await matchTab(page).click()
  const starters = page.getByTestId("matchup-starters")
  const prev = starters.getByRole("button", { name: "Previous scoring week" })
  const next = starters.getByRole("button", { name: "Next scoring week" })
  const label = starters.locator('span[role="status"]').filter({ hasText: /^Week [0-9]+$/ })
  let current = Number((await label.textContent())?.match(/[0-9]+/)?.[0] ?? "0")
  expect(current).toBeGreaterThanOrEqual(1)
  expect(current).toBeLessThanOrEqual(MAX_FANTASY_WEEK)
  while (current > 1) {
    await prev.click()
    current--
    await expect(label).toHaveText(`Week ${current}`)
  }
  await expect(prev).toBeDisabled()
  while (current < MAX_FANTASY_WEEK) {
    await next.click()
    current++
    await expect(label).toHaveText(`Week ${current}`)
  }
  await expect(next).toBeDisabled()
  await expect(label).toHaveText(`Week ${MAX_FANTASY_WEEK}`)
  expect(writes).toEqual([])
})
