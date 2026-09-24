import { test, expect, type Page } from "@playwright/test"

/** The Next app mounts the workspace presentation at `/`, the same one the
    published demo embeds. These cover it end to end on browser storage. */
const board = (page: Page) => page.getByLabel("Agora board", { exact: true })
const column = (page: Page, label: string) => board(page).getByRole("region", { name: `${label} column`, exact: true })

async function add(page: Page, title: string, description = "") {
  await board(page).getByRole("button", { name: "New task", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill(title)
  if (description) await dialog.getByRole("textbox", { name: "Description", exact: true }).fill(description)
  await dialog.getByRole("button", { name: "Create task", exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(board(page).getByRole("button", { name: "New task", exact: true })).toBeEnabled()
})

test("create a task, persist it across a reload and open it again", async ({ page }) => {
  await expect(board(page).locator(".agora-card")).toHaveCount(0)
  await add(page, "Ship the workspace", "Keep this context")

  await expect(column(page, "Todo").getByText("Ship the workspace", { exact: true })).toBeVisible()
  await page.reload()
  await expect(column(page, "Todo").getByText("Ship the workspace", { exact: true })).toBeVisible()

  await column(page, "Todo").locator(".agora-card").first().click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Ship the workspace")
  await expect(dialog.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("Keep this context")
  await dialog.getByRole("button", { name: "Close task", exact: true }).click()
  await expect(dialog).not.toBeVisible()
})

test("the workspace toolbar controls the board", async ({ page }) => {
  await add(page, "Plan me")

  // Local storage, not a shared board: no agent inbox to review.
  await expect(board(page).getByRole("button", { name: /^Suggestions/ })).toHaveCount(0)

  await board(page).getByRole("button", { name: "Projects", exact: true }).click()
  await expect(board(page).getByLabel("Project cards")).toBeVisible()
  await expect(board(page).getByText("Plan me", { exact: true })).toBeVisible()
  await board(page).getByRole("button", { name: "Cards", exact: true }).click()
  await expect(column(page, "Todo").getByText("Plan me", { exact: true })).toBeVisible()

  // Backlog is hidden by default; the column menu brings it back.
  await expect(column(page, "Backlog")).toHaveCount(0)
  await board(page).getByRole("button", { name: /columns$/ }).click()
  await page.getByRole("checkbox", { name: "Backlog", exact: true }).check()
  await page.keyboard.press("Escape")
  await expect(column(page, "Backlog")).toBeVisible()
})
