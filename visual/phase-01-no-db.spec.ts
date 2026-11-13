import { expect, test } from "@playwright/test"

test("missing Prisma connection never displays demo rosters as production data", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("league-unavailable")).toBeVisible()
  await expect(page.getByRole("heading", { name: "League data unavailable" })).toBeVisible()
  await expect(page.getByText(/Sample rosters and scores are never substituted/)).toBeVisible()
  await expect(page.getByRole("link", { name: "Retry loading" })).toBeVisible()
  await expect(page.getByTestId("preview-fixture-banner")).toHaveCount(0)
  await expect(page.getByText("Nathan MacKinnon")).toHaveCount(0)
})
