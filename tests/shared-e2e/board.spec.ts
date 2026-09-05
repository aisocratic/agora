import { test, expect, type Page } from "@playwright/test"

async function signIn(page: Page) {
  await page.goto("/")
  await page.getByLabel("Shared password").fill("browser-test-password-2026")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible()
}

test.beforeEach(async ({ request, page }) => {
  let state = await (await request.get("/api/board", { headers: { Authorization: "Bearer browser-api-token-2026-at-least-32-characters" } })).json()
  for (const card of state.board.cards) {
    for (const type of card.archived ? ["delete"] : ["archive", "delete"]) {
      const response = await request.post("/api/board", { headers: { Authorization: "Bearer browser-api-token-2026-at-least-32-characters" }, data: { revision: state.revision, action: { type, id: card.id } } })
      expect(response.ok()).toBe(true)
      state = await response.json()
    }
  }
  await signIn(page)
})

async function add(page: Page, title: string) {
  await page.getByRole("button", { name: "New card", exact: true }).click()
  await page.getByRole("dialog").getByLabel("Title", { exact: true }).fill(title)
  await page.getByRole("dialog").getByRole("button", { name: "Create card", exact: true }).click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
}
test("independent browsers share edits, moves, archive/restore/delete and conflict-safe drafts", async ({ page, browser }) => {
  const secondContext = await browser.newContext()
  const second = await secondContext.newPage()
  await page.goto("/")
  await second.goto("http://127.0.0.1:4290/")
  await second.getByLabel("Shared password").fill("browser-test-password-2026")
  await second.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(second.getByRole("button", { name: "Sign out", exact: true })).toBeVisible()
  await expect(page.getByText("Shared board · saved in Postgres · updates automatically")).toBeVisible()
  await add(page, "Shared task")
  await expect(second.getByRole("button", { name: "Edit Shared task", exact: true })).toBeVisible()
  await second.getByRole("button", { name: "Edit Shared task", exact: true }).click()
  await second.getByRole("dialog").getByLabel("Title", { exact: true }).fill("My retained draft")
  await page.getByRole("button", { name: "Edit Shared task", exact: true }).click()
  await page.getByRole("dialog").getByLabel("Title", { exact: true }).fill("First editor saved")
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  // Let polling refresh the second board while its draft remains open.
  await expect(second.locator(".agora-card-title")).toHaveText(["First editor saved"])
  await second.getByRole("dialog").getByRole("button", { name: "Save changes" }).click()
  await expect(second.getByRole("dialog").getByRole("alert")).toContainText("changed in another client")
  await expect(second.getByRole("dialog").getByLabel("Title", { exact: true })).toHaveValue("My retained draft")
  await second.getByRole("dialog").getByRole("button", { name: "Save changes" }).click()
  await expect(second.getByRole("dialog")).not.toBeVisible()
  await expect(page.getByRole("button", { name: "Edit My retained draft", exact: true })).toBeVisible()
  await second.getByLabel("Move My retained draft to column", { exact: true }).selectOption("doing")
  await expect(page.locator('[data-column="doing"] .agora-card-title')).toHaveText(["My retained draft"])
  await page.reload()
  await expect(page.locator('[data-column="doing"] .agora-card-title')).toHaveText(["My retained draft"])
  await page.getByRole("button", { name: "Archive My retained draft", exact: true }).click()
  await expect(second.locator(".agora-card")).toHaveCount(0)
  await second.getByRole("button", { name: "Archive (1)", exact: true }).click()
  await second.getByRole("button", { name: "Restore My retained draft", exact: true }).click()
  await expect(page.locator(".agora-card")).toHaveCount(1)
  await page.getByRole("button", { name: "Archive My retained draft", exact: true }).click()
  await expect(second.getByRole("button", { name: "Delete My retained draft permanently", exact: true })).toBeVisible()
  await second.getByRole("button", { name: "Delete My retained draft permanently", exact: true }).click()
  await second.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click()
  await expect(page.getByRole("button", { name: "Archive (0)", exact: true })).toBeVisible()
  await secondContext.close()
})

test("failed network saves retain drafts and pending saves cannot be dismissed", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "New card", exact: true }).click()
  await page.getByRole("dialog").getByLabel("Title", { exact: true }).fill("Survives failure")
  await page.route("**/api/board", async (route) => {
    if (route.request().method() === "POST") await route.abort()
    else await route.continue()
  })
  await page.getByRole("dialog").getByRole("button", { name: "Create card", exact: true }).click()
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible()
  await expect(page.getByRole("dialog").getByLabel("Title", { exact: true })).toHaveValue("Survives failure")
  await page.unroute("**/api/board")
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route("**/api/board", async (route) => {
    if (route.request().method() === "POST") await gate
    await route.continue()
  })
  await page.getByRole("dialog").getByRole("button", { name: "Create card", exact: true }).click()
  await expect(page.getByRole("dialog").getByRole("button", { name: "Saving…" })).toBeDisabled()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeVisible()
  release()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await page.unroute("**/api/board")
  await page.reload()
  await expect(page.getByRole("button", { name: "Edit Survives failure", exact: true })).toBeVisible()
})

test("shared keyboard drag reorder persists and mobile board remains usable", async ({ page }) => {
  await page.goto("/")
  await add(page, "Order first")
  await add(page, "Order second")
  const handle = page.getByRole("button", { name: "Drag Order second", exact: true })
  await handle.focus()
  await page.keyboard.press("Space", { delay: 100 })
  await expect(handle).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("ArrowUp", { delay: 100 })
  await page.keyboard.press("Space", { delay: 100 })
  await expect(handle).not.toHaveAttribute("aria-pressed", "true")
  await expect(page.locator('[data-column="backlog"] .agora-card-title')).toHaveText(["Order second", "Order first"])
  await page.reload()
  await expect(page.locator('[data-column="backlog"] .agora-card-title')).toHaveText(["Order second", "Order first"])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "Edit Order second", exact: true }).click()
  await expect(page.getByRole("dialog").getByLabel("Title", { exact: true })).toHaveValue("Order second")
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
