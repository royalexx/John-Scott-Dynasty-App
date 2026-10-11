import { expect, test, type Page } from "@playwright/test"

function installRuntimeErrorGuard(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  return errors
}

test("dashboard loads and all primary tabs render without runtime errors", async ({ page }) => {
  const errors = installRuntimeErrorGuard(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "JOHN SCOTT DYNASTY" })).toBeVisible()
  await expect(page.getByText("Montreal Monarchs", { exact: true }).first()).toBeVisible()

  await page.getByRole("button", { name: "MATCH", exact: true }).click()
  await expect(page.getByText("Starters", { exact: false }).first()).toBeVisible()
  await expect(page.getByText("vs", { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/proj \d+\.\d/).first()).toBeVisible()

  await page.getByRole("button", { name: "PLAYERS", exact: true }).click()
  for (const label of ["ALL", "C", "W", "D", "G"]) {
    await expect(page.getByRole("button", { name: label, exact: true }).first()).toBeVisible()
  }
  await expect(page.getByRole("heading", { name: "Available", exact: true })).toBeVisible()
  await expect(page.locator("button").filter({ hasText: "FA" }).first()).toBeVisible()

  await page.getByRole("button", { name: "LEAGUE", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Matchups", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Standings", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "TEAM", exact: true }).click()
  await expect(page.getByText(/Starters \(/).first()).toBeVisible()
  await expect(page.getByText(/Bench \(/).first()).toBeVisible()
  expect(errors, errors.join("\n")).toEqual([])
})
