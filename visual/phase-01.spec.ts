import { expect, test } from "@playwright/test"

test("Team trade action repeatedly opens Trade, even after manual Players subtab navigation", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("preview-fixture-banner")).toBeVisible()

  await page.getByRole("button", { name: "PLAYERS", exact: true }).click()
  await page.getByRole("button", { name: "Search", exact: true }).click()
  await page.getByRole("button", { name: "TEAM", exact: true }).click()
  await page.getByRole("button", { name: "trade", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Offers", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Trade", exact: true })).toHaveAttribute("aria-pressed", "true")

  // A second contextual request must still win over the market's previous local selection.
  await page.getByRole("button", { name: "Available", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Available", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "TEAM", exact: true }).click()
  await page.getByRole("button", { name: "trade", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Offers", exact: true })).toBeVisible()
})

test("Match and League avoid misleading uncalibrated win percentages", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "MATCH", exact: true }).click()
  await expect(page.getByText(/Projected points:/).first()).toBeVisible()
  await expect(page.getByText(/^\d+% WIN$/)).toHaveCount(0)
  await page.getByRole("button", { name: "LEAGUE", exact: true }).click()
  await expect(page.getByText(/Week \d+ · (Actual|Projected) points/i).first()).toBeVisible()
  await expect(page.getByText(/^\d+% WIN$/)).toHaveCount(0)
})

test("Player market labels the fantasy-point metric and retains photographs", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "PLAYERS", exact: true }).click()
  await expect(page.getByText("Projected FPTS", { exact: true })).toBeVisible()
  const claim = page.locator("button[aria-label^='Add or claim']").first()
  if (await claim.count()) {
    const rect = await claim.boundingBox()
    expect(rect?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await page.getByRole("button", { name: "TEAM", exact: true }).click()
  const portrait = page.locator("main button img").first()
  await expect(portrait).toHaveAttribute("src", /\/api\/headshot|assets\.nhle\.com/)
})
