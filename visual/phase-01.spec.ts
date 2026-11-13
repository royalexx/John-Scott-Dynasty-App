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


test("draft queue can be operated independently from player selection using the keyboard", async ({ page }) => {
  const { marketPlayers } = await import("../lib/hockey-data")
  const players = marketPlayers.slice(0, 3).map((player, index) => ({ ...player, nhlId: 8470001 + index }))
  let draft = {
    id: "fixture-draft",
    type: "SNAKE",
    status: "LIVE",
    rounds: 1,
    timerSeconds: 60,
    startAt: "2026-11-13T18:00:00.000Z",
    paused: true,
    remainingSeconds: 60,
    yourTurn: false,
    onClockTeamId: "fixture-other-team",
    teams: [{ id: "fixture-other-team", name: "Other Team", slot: 1 }],
    queue: [] as number[],
    slots: [{
      pickNumber: 1,
      round: 1,
      slot: 1,
      teamId: "fixture-other-team",
      teamName: "Other Team",
      playerId: null,
      playerName: null,
      position: null,
      nhlTeam: null,
    }],
  }
  const queueActions: string[] = []
  await page.route("**/api/players**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(players) })
  })
  await page.route("**/api/draft**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ scheduled: null, draft }) })
      return
    }
    const action = route.request().postDataJSON() as { action: string; playerId: number }
    queueActions.push(action.action)
    if (action.action === "queue-add") draft = { ...draft, queue: [...draft.queue, action.playerId] }
    if (action.action === "queue-remove") draft = { ...draft, queue: draft.queue.filter((id) => id !== action.playerId) }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ draft }) })
  })
  await page.goto("/")
  await page.getByRole("button", { name: "LEAGUE", exact: true }).click()
  await page.getByRole("button", { name: "Draft room", exact: true }).click()
  await page.getByRole("button", { name: /^players$/i }).last().click()
  const name = players[0].name
  const select = page.locator("li").filter({ hasText: name }).getByRole("button").first()
  await expect(select).toHaveAttribute("aria-pressed", "false")
  const add = page.getByRole("button", { name: "Queue " + name, exact: true })
  await add.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "Remove " + name, exact: true })).toBeVisible()
  await expect(select).toHaveAttribute("aria-pressed", "false")
  expect(queueActions).toEqual(["queue-add"])
  const remove = page.getByRole("button", { name: "Remove " + name, exact: true })
  await remove.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "Queue " + name, exact: true })).toBeVisible()
  expect(queueActions).toEqual(["queue-add", "queue-remove"])
})
