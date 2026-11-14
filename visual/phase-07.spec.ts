import { expect, test, type Page, type TestInfo } from "@playwright/test"

const mainTab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true })

async function capture(page: Page, info: TestInfo, name: string) {
  await page.waitForTimeout(300)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, animations: "disabled", caret: "hide" })
  await info.attach(name, { path, contentType: "image/png" })
}

function expectTouch(rect: { width: number; height: number } | null) {
  // Chromium can report a CSS 44px box as 43.999992px due to fractional layout.
  // Tolerate 0.01px numerical noise, not a materially undersized touch target.
  expect(rect?.width ?? 0).toBeGreaterThanOrEqual(43.99)
  expect(rect?.height ?? 0).toBeGreaterThanOrEqual(43.99)
}

for (const width of [320, 390]) {
  test(`Phase 7: direct messages have accessible search, close and focus at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    await page.goto("/")
    const open = page.getByRole("button", { name: "Open direct messages" })
    await open.click()
    const drawer = page.getByRole("dialog").last()
    await expect(drawer).toBeVisible()
    const search = drawer.getByRole("textbox", { name: "Search managers" })
    await expect(search).toBeVisible()
    expectTouch(await search.boundingBox())
    const close = drawer.getByRole("button", { name: "Close direct messages" })
    expectTouch(await close.boundingBox())
    await search.fill("not-a-manager")
    await capture(page, info, `phase-07-direct-messages-${width}`)
    await page.keyboard.press("Escape")
    await expect(drawer).toHaveCount(0)
    await expect(open).toBeFocused()
    const overflow = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }))
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1)
  })

  test(`Phase 7: player grid filters expose selection to assistive technology at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    const writes: string[] = []
    page.on("request", request => {
      if (request.method() !== "GET" && /\/api\//.test(request.url())) writes.push(request.url())
    })
    await page.goto("/ui-design-system")
    await page.getByRole("button", { name: "Review player grid settings" }).click()
    const dialog = page.getByRole("dialog").last()
    await expect(dialog).toBeVisible()
    expectTouch(await dialog.getByRole("button", { name: "Close player grid settings" }).boundingBox())
    const view = dialog.getByRole("group", { name: "VIEW TYPE" })
    await expect(view.getByRole("button", { name: "Projections" })).toHaveAttribute("aria-pressed", "true")
    await view.getByRole("button", { name: "Stats", exact: true }).click()
    await expect(view.getByRole("button", { name: "Stats", exact: true })).toHaveAttribute("aria-pressed", "true")
    const time = dialog.getByRole("group", { name: "TIME HORIZON" })
    await expect(time.getByRole("button", { name: "Last 14 Days" })).toHaveAttribute("aria-pressed", "true")
    await time.getByRole("button", { name: "Last 7 Days" }).click()
    await expect(time.getByRole("button", { name: "Last 7 Days" })).toHaveAttribute("aria-pressed", "true")
    await capture(page, info, `phase-07-player-grid-${width}`)
    await dialog.getByRole("button", { name: "Done" }).click()
    await expect(page.getByTestId("gallery-action-feedback")).toHaveText("Preview only · Grid settings tested")
    expect(writes).toEqual([])
  })
}

test("Phase 7: keyboard focus is visible and reduced-motion preference is respected", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const nav = page.getByRole("navigation", { name: "Main navigation" })
  const team = mainTab(page, "TEAM")
  await team.focus()
  await page.keyboard.press("ArrowRight")
  const players = mainTab(page, "PLAYERS")
  await expect(players).toBeFocused()
  const style = await players.evaluate(el => {
    const css = getComputedStyle(el)
    return { outline: css.outlineStyle, width: parseFloat(css.outlineWidth), transition: css.transitionDuration }
  })
  expect(style.outline).not.toBe("none")
  expect(style.width).toBeGreaterThanOrEqual(2)
  const durations = style.transition.split(",").map(s => s.trim()).map(s => s.endsWith("ms") ? parseFloat(s) / 1000 : parseFloat(s))
  expect(Math.max(...durations)).toBeLessThanOrEqual(0.001)
  await expect(players).toHaveAttribute("aria-pressed", "true")
  await capture(page, info, "phase-07-reduced-motion-focus")
  await page.keyboard.press("ArrowLeft")
  await expect(team).toBeFocused()
})

test("Phase 7: semantic dark palette retains readable control text contrast", async ({ page }) => {
  await page.goto("/ui-design-system")
  const contrast = await page.evaluate(() => {
    const values = getComputedStyle(document.documentElement)
    const color = (name: string) => values.getPropertyValue(name).trim()
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
    }
    const ratio = (fg: string, bg: string) => {
      const a = luminance(color(fg)), b = luminance(color(bg))
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }
    return {
      main: ratio("--ds-text", "--ds-canvas"),
      secondary: ratio("--ds-text-secondary", "--ds-surface"),
      muted: ratio("--ds-text-muted", "--ds-surface"),
      link: ratio("--ds-accent", "--ds-canvas"),
      error: ratio("--ds-danger", "--ds-canvas"),
    }
  })
  for (const [label, ratio] of Object.entries(contrast)) {
    expect(ratio, `Contrast for ${label}`).toBeGreaterThanOrEqual(4.5)
  }
})

for (const width of [320, 390, 430]) {
  test(`Phase 7: record measurable shell and tab performance at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : width === 390 ? 844 : 932 })
    await page.goto("/")
    const readings: Array<Record<string, unknown>> = []
    for (const tab of ["MATCH", "TEAM", "PLAYERS", "LEAGUE"]) {
      await mainTab(page, tab).click()
      await page.waitForTimeout(180)
      const metric = await page.evaluate(() => {
        const root = document.documentElement
        const shell = document.querySelector('[data-testid="app-shell"]')
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
        const paints = performance.getEntriesByType("paint") as PerformanceEntry[]
        const fcp = paints.find(p => p.name === "first-contentful-paint")
        return {
          viewport: root.clientWidth,
          scrollWidth: root.scrollWidth,
          shellWidth: shell?.getBoundingClientRect().width ?? 0,
          elementCount: document.querySelectorAll("*").length,
          resourceCount: performance.getEntriesByType("resource").length,
          domContentLoadedMs: nav?.domContentLoadedEventEnd ?? null,
          fcpMs: fcp?.startTime ?? null,
        }
      })
      expect(metric.scrollWidth).toBeLessThanOrEqual(metric.viewport + 1)
      expect(metric.shellWidth).toBeLessThanOrEqual(431)
      readings.push({ tab, ...metric })
    }
    await info.attach(`phase-07-performance-${width}.json`, {
      body: JSON.stringify(readings, null, 2),
      contentType: "application/json",
    })
    // Informative measurements, not claims of improved speed or synthetic performance budgets.
  })
}
