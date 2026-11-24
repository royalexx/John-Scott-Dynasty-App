import { expect, test, type Page, type TestInfo } from "@playwright/test"

const nav = (page: Page, label: string) =>
  page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: label, exact: true })

for (const width of [320, 390, 430]) {
  test(`60% global corner smoothing retains portraits, pills and original layout at ${width}px`, async ({ page }, info: TestInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : width === 390 ? 844 : 932 })
    const mutations: string[] = []
    page.on("request", (request) => {
      if (request.method() !== "GET" && /\/api\//.test(request.url())) mutations.push(request.url())
    })

    await page.goto("/")
    await expect(page.getByTestId("preview-fixture-banner")).toContainText("READ ONLY")

    const browser = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      return {
        supports: CSS.supports("corner-shape", "superellipse(1.777468)"),
        smoothing: Number.parseFloat(root.getPropertyValue("--ds-corner-smoothing").trim()),
        exponent: root.getPropertyValue("--ds-corner-superellipse").trim(),
        radiusSmall: root.getPropertyValue("--ds-radius-sm").trim(),
        radiusMedium: root.getPropertyValue("--ds-radius-md").trim(),
      }
    })
    expect(browser.smoothing).toBeCloseTo(0.6, 6)
    expect(browser.exponent).toBe("superellipse(1.777468)")
    // Chromium 139+ supports corner-shape; browsers without support will retain
    // the original radii instead of losing borders, shadows or touch targets.
    expect(browser.supports).toBe(true)
    expect(browser.radiusSmall).toBe("12.8px")
    expect(browser.radiusMedium).toBe("19.2px")

    for (const tab of ["MATCH", "TEAM", "PLAYERS", "LEAGUE"]) {
      await nav(page, tab).click()
      const styles = await page.evaluate(() => {
        const regular = Array.from(document.querySelectorAll<HTMLElement>("*")).find((element) => {
          const cl = element.classList
          return cl.contains("rounded-lg") || cl.contains("rounded-xl") || cl.contains("rounded-2xl") ||
            cl.contains("rounded-md") || cl.contains("rounded-3xl")
        })
        const pill = document.querySelector<HTMLElement>(".rounded-full")
        const portrait = document.querySelector<HTMLElement>('[data-slot="player-portrait"]')
        const style = (node: HTMLElement | null) => node
          ? {
            shape: getComputedStyle(node).getPropertyValue("corner-shape").trim(),
            radius: getComputedStyle(node).borderTopLeftRadius,
          } : null
        return {
          regular: style(regular ?? null),
          pill: style(pill),
          portrait: style(portrait),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
      expect(styles.regular, `A visible rounded component exists in ${tab}`).not.toBeNull()
      expect(styles.regular!.shape).toMatch(/superellipse\(1\.7774/)
      expect(styles.regular!.radius).not.toBe("0px")
      if (styles.pill) expect(styles.pill.shape).toBe("round")
      if (styles.portrait) expect(styles.portrait.shape).toBe("round")
      expect(styles.overflow, `${tab} horizontal overflow`).toBeLessThanOrEqual(1)
    }
    expect(mutations).toEqual([])
    await nav(page, "TEAM").click()
    await expect(page.locator('[data-slot="player-portrait"]').first()).toBeVisible()
    const screenshot = info.outputPath(`corner-smoothing-60-team-${width}.png`)
    await page.screenshot({ path: screenshot, animations: "disabled", caret: "hide" })
    await info.attach(`corner-smoothing-60-team-${width}`, { path: screenshot, contentType: "image/png" })
  })
}

test("60% corner smoothing also reaches custom arbitrary radii without changing full-circle avatars", async ({ page }) => {
  await page.goto("/")
  const computed = await page.evaluate(() => {
    // Test custom inline radii and non-rounded surfaces outside the specific
    // Tailwind tokens: the global rule must also cover them.
    const fixture = document.createElement("div")
    fixture.style.borderRadius = "14px 0 9px 5px"
    document.body.appendChild(fixture)
    const css = getComputedStyle(fixture)
    const result = {
      shape: css.getPropertyValue("corner-shape").trim(),
      radii: [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomRightRadius, css.borderBottomLeftRadius],
    }
    fixture.remove()
    return result
  })
  expect(computed.shape).toMatch(/superellipse\(1\.7774/)
  expect(computed.radii).toEqual(["14px", "0px", "9px", "5px"])
})
