import { expect, test, type TestInfo, type Page } from "@playwright/test"

async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, animations: "disabled", caret: "hide", fullPage: true })
  await info.attach(name, { path, contentType: "image/png" })
}

for (const width of [320, 390, 430]) {
  test(`Phase 2 design gallery at ${width}px fits without horizontal overflow`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 900 })
    await page.goto("/ui-design-system")
    await expect(page.getByTestId("design-system-gallery")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Interface foundations" })).toBeVisible()
    const metrics = await page.evaluate(() => {
      const root = document.documentElement
      const main = document.querySelector("main")
      return { viewport: root.clientWidth, document: root.scrollWidth, shell: main?.getBoundingClientRect().width ?? 0 }
    })
    expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1)
    expect(metrics.shell).toBeLessThanOrEqual(431)
    await capture(page, info, `phase-02-design-gallery-${width}`)
  })
}

test("semantic dark palette meets normal-text contrast on canvas and cards", async ({ page }) => {
  await page.goto("/ui-design-system")
  const ratios = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    const value = (key: string) => style.getPropertyValue(key).trim()
    const luminance = (hex: string) => {
      const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722
    }
    const ratio = (a: string, b: string) => {
      const first = luminance(value(a)), second = luminance(value(b))
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
    }
    return {
      textOnCanvas: ratio("--ds-text", "--ds-canvas"),
      secondaryOnCard: ratio("--ds-text-secondary", "--ds-surface"),
      mutedOnCard: ratio("--ds-text-muted", "--ds-surface"),
      accentOnCanvas: ratio("--ds-accent", "--ds-canvas"),
    }
  })
  for (const [name, value] of Object.entries(ratios)) {
    expect(value, `${name} contrast should be >= 4.5:1`).toBeGreaterThanOrEqual(4.5)
  }
})

test("real player portraits, shared actions, tabs and bottom sheet remain interactive", async ({ page }) => {
  await page.goto("/ui-design-system")
  await expect(page.locator('[data-slot="player-portrait"]')).toHaveCount(2)
  await expect(page.getByText("Nathan MacKinnon", { exact: true })).toBeVisible()
  await expect(page.getByText("Connor McDavid", { exact: true })).toBeVisible()
  const primary = page.getByRole("button", { name: "Primary", exact: true })
  const rect = await primary.boundingBox()
  expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44)

  await primary.click()
  await expect(page.getByTestId("gallery-action-feedback")).toContainText("Primary action selected")

  await page.getByRole("tab", { name: "Season", exact: true }).click()
  await expect(page.getByText("2026–27 season totals")).toBeVisible()
  await page.getByRole("button", { name: "Open sheet" }).click()
  await expect(page.getByText("Example bottom sheet")).toBeVisible()
  await page.getByRole("button", { name: "Close sheet" }).click()
  await expect(page.getByText("Example bottom sheet")).toHaveCount(0)
})

test("reduced-motion preference suppresses decorative transition timing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/ui-design-system")
  const duration = await page.getByRole("button", { name: "Primary" }).evaluate((el) =>
    getComputedStyle(el).transitionDuration,
  )
  const seconds = duration.split(",").map((value) => {
    const text = value.trim()
    return text.endsWith("ms") ? parseFloat(text) / 1000 : parseFloat(text)
  })
  expect(Math.max(...seconds)).toBeLessThanOrEqual(0.001)
})
