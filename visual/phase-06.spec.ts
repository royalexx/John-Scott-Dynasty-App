import { expect, test, type Page, type TestInfo } from "@playwright/test"

const mainTab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true })
const playerTab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Player market sections" }).getByRole("button", { name, exact: true })

async function capture(page: Page, info: TestInfo, name: string) {
  await page.waitForTimeout(300)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, animations: "disabled", caret: "hide" })
  await info.attach(name, { path, contentType: "image/png" })
}

function expectTouchSize(rect: { width: number; height: number } | null) {
  expect(rect?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44)
}

for (const width of [320, 390]) {
  test(`Phase 6: player profile preserves headshot, tab state and close size at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    await page.goto("/")
    await mainTab(page, "PLAYERS").click()
    const player = page.getByTestId("available-player-list").locator("li button").first()
    await player.click()
    const sheet = page.getByRole("dialog").last()
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('img[src*="headshot"], img[src*="assets.nhle.com"]').first()).toBeAttached()
    await expect(sheet.getByRole("button", { name: "Summary" })).toHaveAttribute("aria-pressed", "true")
    const close = sheet.getByRole("button", { name: "Close player" })
    expectTouchSize(await close.boundingBox())
    await capture(page, info, `phase-06-profile-${width}`)
    await sheet.getByRole("button", { name: "Log", exact: true }).click()
    await expect(sheet.getByRole("button", { name: "Log", exact: true })).toHaveAttribute("aria-pressed", "true")
    await close.click()
    await expect(sheet).toHaveCount(0)
    await player.click()
    await expect(page.getByRole("dialog").last().getByRole("button", { name: "Summary" })).toHaveAttribute("aria-pressed", "true")
  })
}

test("Phase 6: waiver review can return to selection without submitting", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const attemptedWrites: string[] = []
  page.on("request", request => {
    if (request.method() !== "GET" && /\/api\/(waivers|trades|draft)/.test(request.url())) attemptedWrites.push(request.url())
  })
  await page.goto("/")
  await mainTab(page, "PLAYERS").click()
  await page.getByTestId("available-player-list").getByRole("button", { name: /Add or claim/ }).first().click()
  const sheet = page.getByRole("dialog").last()
  await expect(sheet.getByRole("spinbutton", { name: "Bid amount" })).toBeVisible()
  await expect(sheet.locator('[data-slot="player-portrait"] img').first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
  const next = sheet.getByRole("button", { name: "Next", exact: true })
  if (await next.isDisabled()) {
    await sheet.getByRole("button", { name: /^Drop / }).first().click()
  }
  await next.click()
  await expect(sheet.getByRole("heading", { name: "Confirm Transaction" })).toBeVisible()
  const back = sheet.getByRole("button", { name: "Back to waiver selection" })
  expectTouchSize(await back.boundingBox())
  await capture(page, info, "phase-06-waiver-review")
  await back.click()
  await expect(sheet.getByRole("spinbutton", { name: "Bid amount" })).toBeVisible()
  await sheet.getByRole("button", { name: "Close waiver claim" }).click()
  expect(attemptedWrites).toEqual([])
})

test("Phase 6: trade builder safely handles no partners or steps through a proposal without submitting", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const writes: string[] = []
  page.on("request", req => {
    if (req.method() !== "GET" && /\/api\/(trades|waivers|draft)/.test(req.url())) writes.push(req.url())
  })
  await page.goto("/")
  await mainTab(page, "PLAYERS").click()
  await playerTab(page, "Trade").click()
  await page.getByRole("button", { name: "Open Trade Builder" }).click()
  const dialog = page.getByRole("dialog").last()
  await expect(dialog).toBeVisible()
  const progress = dialog.getByRole("progressbar", { name: "Trade builder step" })
  await expect(progress).toHaveAttribute("aria-valuenow", "1")
  expectTouchSize(await dialog.getByRole("button", { name: "Close trade builder" }).boundingBox())
  await capture(page, info, "phase-06-trade-partner")
  // Database-free preview intentionally exposes no other authenticated managers.
  // Assert the safe empty state there; use the three-step path when partner data exists.
  if (await dialog.getByText("No trade partners available.").isVisible()) {
    await expect(dialog.getByRole("button", { name: "Choose assets" })).toBeDisabled()
    await dialog.getByRole("button", { name: "Close trade builder" }).click()
    expect(writes).toEqual([])
    return
  }
  await dialog.getByRole("button").filter({ hasText: /\d+ players/ }).first().click()
  await expect(progress).toHaveAttribute("aria-valuenow", "2")
  const checkbox = dialog.getByRole("checkbox", { name: /^Select / }).first()
  await checkbox.check()
  await expect(checkbox).toBeChecked()
  await capture(page, info, "phase-06-trade-assets")
  await dialog.getByRole("button", { name: "Review proposal" }).click()
  await expect(progress).toHaveAttribute("aria-valuenow", "3")
  await expect(dialog.getByRole("textbox", { name: "Optional trade note" })).toBeVisible()
  await dialog.getByRole("button", { name: "Previous step" }).click()
  await expect(progress).toHaveAttribute("aria-valuenow", "2")
  await dialog.getByRole("button", { name: "Close trade builder" }).click()
  expect(writes).toEqual([])
})

test("Phase 6: simple Team settings remain editable without saving", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto("/")
  await mainTab(page, "TEAM").click()
  await page.getByRole("button", { name: "Edit team customization" }).click()
  const sheet = page.getByRole("dialog").last()
  await expect(sheet.getByRole("textbox", { name: "Team name" })).toBeVisible()
  await expect(sheet.getByRole("textbox", { name: "Team logo URL" })).toBeVisible()
  expectTouchSize(await sheet.getByRole("button", { name: "Close drawer" }).boundingBox())
  expectTouchSize(await sheet.getByRole("button", { name: "Save Team Settings" }).boundingBox())
  await capture(page, info, "phase-06-team-settings-320")
  await sheet.getByRole("button", { name: "Close drawer" }).click()
})

test("Phase 6: draft player and queue tabs render real portraits without mutation", async ({ page }, info) => {
  const players = [{
    rank: 1, nhlId: 8470001, name: "Fixture Center", position: "C", team: "SJS",
    waiver: "FA", velocity: "", rostered: "0%", trend: "0%", fpts: 0,
    projection: 10, gp: 0, goals: 0, assists: 0, sog: 0, hits: 0, blocks: 0, adp: 0,
  }]
  const draft = {
    id: "phase-06-test-draft", type: "SNAKE", status: "LIVE", rounds: 1,
    timerSeconds: 60, startAt: "2026-11-13T18:00:00.000Z",
    paused: true, remainingSeconds: 60, yourTurn: false,
    onClockTeamId: "other-team",
    teams: [{ id: "other-team", name: "Other Team", slot: 1 }],
    queue: [8470001],
    slots: [{
      pickNumber: 1, round: 1, slot: 1, teamId: "other-team",
      teamName: "Other Team", playerId: null, playerName: null,
      position: null, nhlTeam: null,
    }],
  }
  const writes: string[] = []
  await page.route("**/api/players**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(players) }))
  await page.route("**/api/draft**", async route => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().method())
      await route.fulfill({ status: 403, body: "Read-only" })
      return
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ scheduled: null, draft }) })
  })
  await page.goto("/")
  await mainTab(page, "LEAGUE").click()
  await page.getByRole("button", { name: "Draft room" }).click()
  await page.getByRole("button", { name: /^players$/i }).last().click()
  const room = page.getByRole("dialog").last()
  const viewportSheet = await room.boundingBox()
  expect(viewportSheet?.y ?? Infinity).toBeLessThanOrEqual(2)
  expect(viewportSheet?.height ?? 0).toBeGreaterThanOrEqual(800)
  const input = page.getByRole("textbox", { name: "Search draft players" })
  await expect(input).toBeVisible()
  await expect(page.getByText("Fixture Center").first()).toBeVisible()
  const photos = page.locator('[data-slot="player-portrait"] img')
  await expect(photos.last()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
  await capture(page, info, "phase-06-draft-players")
  await page.getByRole("button", { name: /^queue$/i }).last().click()
  await expect(page.getByRole("button", { name: "Remove Fixture Center from queue" })).toBeVisible()
  await capture(page, info, "phase-06-draft-queue")
  expect(writes).toEqual([])
})

for (const width of [320, 390]) {
  test(`Phase 6: preview-only trade fixture completes all three steps at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    const attemptedWrites: string[] = []
    page.on("request", request => {
      if (request.method() !== "GET" && /\/api\/(trades|waivers|draft)/.test(request.url())) attemptedWrites.push(request.url())
    })
    await page.goto("/ui-design-system")
    await page.getByRole("button", { name: "Review trade workflow" }).click()
    const dialog = page.getByRole("dialog").last()
    const progress = dialog.getByRole("progressbar", { name: "Trade builder step" })
    await expect(progress).toHaveAttribute("aria-valuenow", "1")
    await dialog.getByRole("button", { name: /Sample Opponent/ }).click()
    await expect(progress).toHaveAttribute("aria-valuenow", "2")
    const player = dialog.getByRole("checkbox", { name: /^Select / }).first()
    await player.check()
    await expect(player).toBeChecked()
    await expect(dialog.locator('[data-slot="player-portrait"] img').first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
    await capture(page, info, `phase-06-trade-assets-${width}`)
    await dialog.getByRole("button", { name: "Review proposal" }).click()
    await expect(progress).toHaveAttribute("aria-valuenow", "3")
    await expect(dialog.getByRole("textbox", { name: "Optional trade note" })).toBeVisible()
    await capture(page, info, `phase-06-trade-review-${width}`)
    await dialog.getByRole("button", { name: "Send trade" }).click()
    await expect(page.getByTestId("gallery-action-feedback")).toHaveText("Preview only · No trade saved")
    expect(attemptedWrites).toEqual([])
  })
}
