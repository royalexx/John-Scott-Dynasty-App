import { expect, test } from "@playwright/test"

test("roster names and player profiles render safely", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.goto("/")
  await expect(page.getByText(/Matthews|MacKinnon/).first()).toBeVisible()
  await expect(page.getByText("NHL Player", { exact: false })).toHaveCount(0)

  const playerRow = page.locator("button").filter({ hasText: /Matthews|MacKinnon/ }).first()
  await playerRow.click()
  await expect(page.getByRole("button", { name: "Summary", exact: true })).toBeVisible()
  await expect(page.getByText("This week", { exact: true })).toBeVisible()
  for (const tab of ["Log", "Team", "History", "News"]) {
    await page.getByRole("button", { name: tab, exact: true }).click()
    await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible()
  }
  await page.getByRole("button", { name: "Close player" }).click()
  expect(errors, errors.join("\n")).toEqual([])
})

test("lineup slot dialog can swap an eligible player", async ({ page }) => {
  // Never persist lineup swaps to the shared database.
  await page.route("**/api/roster/move", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) }),
  )
  await page.goto("/")
  const slotButton = page.locator("button").filter({ hasText: /^C$|^W$|^F$|^D$|^G$/ }).first()
  await slotButton.click()
  await expect(page.getByText("Eligible swap targets", { exact: true })).toBeVisible()
  const target = page.getByRole("button").filter({ hasText: "Swap starter" }).first()
  if (await target.count()) {
    await target.click()
    await expect(page.getByText(/Swapped .* with .*/)).toBeVisible()
  } else {
    await page.getByRole("button", { name: "Close swap player drawer" }).click()
  }
})
