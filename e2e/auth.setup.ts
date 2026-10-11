import { expect, test as setup } from "@playwright/test"

const authFile = "e2e/.auth/manager.json"

setup("authenticate manager", async ({ page }) => {
  await page.goto("/")
  const teamButton = page.getByRole("button", { name: /Montreal Monarchs/ })
  await expect(teamButton).toBeVisible()
  await teamButton.click()
  for (const digit of ["1", "2", "3", "4"]) {
    await page.getByRole("button", { name: digit, exact: true }).click()
  }
  await expect(page.getByRole("heading", { name: "JOHN SCOTT DYNASTY" })).toBeVisible()
  await page.context().storageState({ path: authFile })
})
