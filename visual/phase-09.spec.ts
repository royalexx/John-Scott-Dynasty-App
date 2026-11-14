import { expect, test, type Page, type TestInfo } from "@playwright/test"

async function screenshot(page: Page, info: TestInfo, label: string) {
  await page.waitForTimeout(250)
  const path = info.outputPath(`${label}.png`)
  await page.screenshot({ path, animations: "disabled", caret: "hide" })
  await info.attach(label, { path, contentType: "image/png" })
}

const teamTab = (page: Page) =>
  page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "TEAM", exact: true })

for (const width of [320, 390]) {
  test(`Phase 9: Team week navigation and roster editing remain touch-accessible at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    const writes: string[] = []
    page.on("request", request => {
      if (request.method() !== "GET" && /\/api\/(roster|waivers|trades)/.test(request.url())) writes.push(request.url())
    })
    await page.goto("/")
    await teamTab(page).click()
    const prev = page.getByRole("button", { name: "Previous team week" })
    const next = page.getByRole("button", { name: "Next team week" })
    for (const button of [prev, next]) {
      const rect = await button.boundingBox()
      expect(rect?.width ?? 0).toBeGreaterThanOrEqual(44)
      expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
    const week = page.locator('span[role="status"]').filter({ hasText: /^Week \d+$/ }).first()
    const current = Number((await week.textContent())?.match(/\d+/)?.[0] ?? "0")
    expect(current).toBeGreaterThanOrEqual(1)
    if (current < 24) {
      await next.click()
      await expect(week).toHaveText(`Week ${current + 1}`)
      await prev.click()
      await expect(week).toHaveText(`Week ${current}`)
    }
    const edit = page.getByRole("button", { name: /^Edit .* in (C|W|F|D|G|BN|IR) slot$/ }).first()
    await expect(edit).toBeVisible()
    const rect = await edit.boundingBox()
    expect(rect?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44)
    await edit.click()
    const dialog = page.getByRole("dialog").last()
    await expect(dialog.getByRole("heading", { name: "Swap Player" })).toBeVisible()
    const close = dialog.getByRole("button", { name: "Close swap player drawer" })
    const closeRect = await close.boundingBox()
    expect(closeRect?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(closeRect?.height ?? 0).toBeGreaterThanOrEqual(44)
    await screenshot(page, info, `phase-09-roster-swap-${width}`)
    await close.click()
    expect(writes).toEqual([])
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }))
    expect(overflow.page).toBeLessThanOrEqual(overflow.viewport + 1)
    await expect(page.locator('[data-slot="player-portrait"] img').first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
  })

  test(`Phase 9: actionable lineup warning opens a real swap sheet without saving at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    const writes: string[] = []
    page.on("request", request => {
      if (request.method() !== "GET" && /\/api\//.test(request.url())) writes.push(request.url())
    })
    await page.goto("/ui-design-system")
    const fixture = page.getByTestId("lineup-health-preview")
    await expect(fixture.getByText("Lineup needs attention")).toBeVisible()
    await expect(fixture.getByText(/1 empty starting slot/)).toBeVisible()
    const review = fixture.getByTestId("lineup-review-action")
    await expect(review).toHaveText(/Fill empty C slot/)
    const rect = await review.boundingBox()
    expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44)
    await screenshot(page, info, `phase-09-lineup-alert-${width}`)
    await review.click()
    const sheet = page.getByRole("dialog").last()
    await expect(sheet.getByRole("heading", { name: "Fill C Slot" })).toBeVisible()
    const candidates = sheet.getByRole("button", { name: /^Fill C with/ })
    await expect(candidates.first()).toBeVisible()
    await expect(sheet.locator('[data-slot="player-portrait"] img').first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
    await screenshot(page, info, `phase-09-lineup-eligible-${width}`)
    await candidates.first().click()
    await expect(page.getByTestId("gallery-action-feedback")).toHaveText("Preview only · Lineup unchanged")
    expect(writes).toEqual([])
  })
}
