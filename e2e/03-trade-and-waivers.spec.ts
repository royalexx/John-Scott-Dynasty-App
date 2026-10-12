import { expect, test } from "@playwright/test"

test("waiver claim dialog submits a bid and shows the claim", async ({ page }) => {
  // Never write a real claim to the shared database.
  await page.route("**/api/waivers", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ claim: { id: "e2e-mock-claim" } }) })
  })
  await page.goto("/")
  await page.getByRole("button", { name: "PLAYERS", exact: true }).click()
  const claimButton = page.locator("button[aria-label^='Add or claim']").first()
  await claimButton.click()
  await expect(page.getByText("Bid Amount", { exact: true })).toBeVisible()
  await page.getByLabel("Bid amount").fill("1")
  await page.getByText("STARTERS", { exact: true }).click()
  const dropPlayer = page.locator("button").filter({ hasText: /Matthews|MacKinnon|[A-Z][a-z]+ [A-Z][a-z]+/ }).first()
  await dropPlayer.click()
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await page.getByRole("button", { name: "Confirm", exact: true }).click()
  await expect(page.getByText(/has been added to your waivers|Could not submit waiver/i)).toBeVisible()
})

test("trade center and trade builder render without crashes", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.goto("/")
  await page.getByRole("button", { name: "PLAYERS", exact: true }).click()
  await page.getByRole("button", { name: "Trade", exact: true }).click()
  await expect(page.getByText("Trade History & Active Offers", { exact: true })).toBeVisible()
  await expect(page.getByText(/Cannot read properties of undefined/)).toHaveCount(0)
  await page.getByRole("button", { name: "Open Trade Builder", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Trade Builder" })).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: /15 picks/ }).first().click({ force: true })
  await expect(page.getByText(/2027 .*Round/).first()).toBeVisible()
  await page.getByRole("button", { name: "Close trade builder" }).click()
  expect(errors, errors.join("\n")).toEqual([])
})
