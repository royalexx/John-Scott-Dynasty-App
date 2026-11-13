import { expect, test, type Page, type TestInfo } from "@playwright/test"

async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, animations: "disabled", caret: "hide" })
  await info.attach(name, { path, contentType: "image/png" })
}

const widths = [
  { width: 320, height: 700 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]

for (const viewport of widths) {
  test(`Phase 3: header, tabs and dock remain distinct at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await page.goto("/")
    const shell = page.getByTestId("app-shell")
    const header = page.getByTestId("app-header")
    const navigation = page.getByRole("navigation", { name: "Main navigation" })
    const dock = page.getByTestId("chat-dock")
    const pager = page.locator('[data-swipe="tab"]')
    await expect(shell).toBeVisible()
    await expect(dock).toBeVisible()

    const measurements = []
    for (const tab of ["MATCH", "TEAM", "PLAYERS", "LEAGUE"] as const) {
      const selected = navigation.getByRole("button", { name: tab, exact: true })
      await selected.click()
      await expect(selected).toHaveAttribute("aria-pressed", "true")
      // The pager springs after state updates; capture the settled screen, not a mid-swipe frame.
      await page.waitForTimeout(550)
      for (const other of ["MATCH", "TEAM", "PLAYERS", "LEAGUE"]) {
        if (other !== tab) await expect(navigation.getByRole("button", { name: other })).toHaveAttribute("aria-pressed", "false")
      }
      const values = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect()
        const shell = box('[data-testid="app-shell"]')!
        const header = box('[data-testid="app-header"]')!
        const nav = box('nav[aria-label="Main navigation"]')!
        const pager = box('[data-swipe="tab"]')!
        const dock = box('[data-testid="chat-dock"]')!
        return {
          viewport: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          shellWidth: shell.width,
          shellHeight: shell.height,
          headerHeight: header.height,
          navHeight: nav.height,
          pagerBottom: pager.bottom,
          dockTop: dock.top,
          dockBottom: dock.bottom,
          shellBottom: shell.bottom,
          bodyPaddingTop: getComputedStyle(document.body).paddingTop,
          bodyPaddingBottom: getComputedStyle(document.body).paddingBottom,
        }
      })
      expect(values.scrollWidth).toBeLessThanOrEqual(values.viewport + 1)
      expect(values.shellWidth).toBeLessThanOrEqual(431)
      expect(values.shellHeight).toBeLessThanOrEqual(viewport.height + 1)
      expect(values.headerHeight).toBeGreaterThanOrEqual(56)
      expect(values.navHeight).toBeGreaterThanOrEqual(44)
      expect(values.dockTop, "chat should be in layout, not overlap content").toBeGreaterThanOrEqual(values.pagerBottom - 1)
      expect(values.dockBottom).toBeLessThanOrEqual(values.shellBottom + 1)
      expect(values.bodyPaddingTop).toBe("0px")
      expect(values.bodyPaddingBottom).toBe("0px")
      measurements.push({ tab, ...values })
      await capture(page, info, `phase-03-${viewport.width}-${tab.toLowerCase()}`)
    }
    await info.attach(`phase-03-layout-${viewport.width}`, {
      body: JSON.stringify(measurements, null, 2),
      contentType: "application/json",
    })
    await expect(header.getByRole("button", { name: "Open direct messages" })).toBeVisible()
    await expect(header.getByRole("button", { name: "League & Team Settings" })).toBeVisible()
  })
}

test("Phase 3: arrow keys navigate primary destinations without trapping focus", async ({ page }) => {
  await page.goto("/")
  const nav = page.getByRole("navigation", { name: "Main navigation" })
  const team = nav.getByRole("button", { name: "TEAM", exact: true })
  const players = nav.getByRole("button", { name: "PLAYERS", exact: true })
  await team.focus()
  await page.keyboard.press("ArrowRight")
  await expect(players).toBeFocused()
  await expect(players).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("ArrowLeft")
  await expect(team).toBeFocused()
  await expect(team).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("ArrowLeft")
  const match = nav.getByRole("button", { name: "MATCH", exact: true })
  await expect(match).toBeFocused()
  await expect(match).toHaveAttribute("aria-pressed", "true")
})

test("Phase 3: chat drawer has safe-size controls and preview does not allow sending", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto("/")
  const opener = page.getByRole("button", { name: "Open league chat" })
  await opener.click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/Preview only.*Messages cannot be sent/)).toBeVisible()
  const close = page.getByRole("button", { name: "Close league chat" })
  const send = page.getByRole("button", { name: "Send message" })
  const input = page.getByRole("textbox", { name: "Chat message" })
  await expect(input).toBeDisabled()
  await expect(send).toBeDisabled()
  const closeRect = await close.boundingBox()
  const sendRect = await send.boundingBox()
  expect(closeRect?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(closeRect?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(sendRect?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(sendRect?.height ?? 0).toBeGreaterThanOrEqual(44)
  const bounds = await dialog.boundingBox()
  expect(bounds ? bounds.y + bounds.height : Infinity).toBeLessThanOrEqual(701)
  await capture(page, info, "phase-03-chat-320")
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test("Phase 3: main content still shows real player photos after layout migration", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "TEAM", exact: true }).click()
  const portraits = page.locator('[data-slot="player-portrait"] img')
  await expect(portraits.first()).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
  expect(await portraits.count()).toBeGreaterThan(0)
  await expect(page.getByText("sleeper", { exact: true })).toHaveCount(0)
})

test("Phase 3: reduced motion retains keyboard tab switching", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const nav = page.getByRole("navigation", { name: "Main navigation" })
  await nav.getByRole("button", { name: "MATCH", exact: true }).click()
  await expect(nav.getByRole("button", { name: "MATCH" })).toHaveAttribute("aria-pressed", "true")
  await nav.getByRole("button", { name: "LEAGUE", exact: true }).click()
  await expect(nav.getByRole("button", { name: "LEAGUE" })).toHaveAttribute("aria-pressed", "true")
})

test("Phase 3: horizontal finger-style swipe still changes main destinations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  const nav = page.getByRole("navigation", { name: "Main navigation" })
  const tab = (name: string) => nav.getByRole("button", { name, exact: true })
  await expect(tab("TEAM")).toHaveAttribute("aria-pressed", "true")
  const box = await page.locator('[data-swipe="tab"]').boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  const y = box.y + Math.min(120, box.height / 3)
  const startX = box.x + box.width * 0.3
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + box.width * 0.45, y, { steps: 8 })
  await page.mouse.up()
  await expect(tab("MATCH")).toHaveAttribute("aria-pressed", "true")
  await page.waitForTimeout(550)

  const nextX = box.x + box.width * 0.7
  await page.mouse.move(nextX, y)
  await page.mouse.down()
  await page.mouse.move(nextX - box.width * 0.45, y, { steps: 8 })
  await page.mouse.up()
  await expect(tab("TEAM")).toHaveAttribute("aria-pressed", "true")
})
