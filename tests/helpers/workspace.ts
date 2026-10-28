import { expect, type Locator, type Page } from "@playwright/test"

/** The Next app mounts the workspace presentation of the board. These drive it
    the way a person does: cards open by clicking them, the editor saves as you
    type, and selects are the design system's listboxes rather than <select>. */
export const board = (page: Page) => page.getByLabel("Agora board", { exact: true })
export const column = (page: Page, id: string) => board(page).locator(`[data-column="${id}"]`)
export const card = (page: Page, title: string) => board(page).getByRole("article", { name: title, exact: true })
export const editor = (page: Page) => page.getByRole("dialog")

export async function signIn(page: Page, url = "/") {
  await page.goto(url)
  await page.getByLabel("Shared password").fill("browser-test-password-2026")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible()
  await expect(board(page).getByRole("button", { name: "Add card", exact: true })).toBeEnabled()
}

/** Pick an option in a labelled design-system select. */
export async function choose(scope: Locator, label: string, option: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).click()
  await scope.page().getByRole("option", { name: option, exact: true }).click()
}

/** Open the new-card editor for a type and fill in the title. */
export async function startCard(page: Page, title: string, type = "Task") {
  await board(page).getByRole("button", { name: "Add card", exact: true }).click()
  await page.getByRole("button", { name: type, exact: true }).click()
  const dialog = editor(page)
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill(title)
  return dialog
}

/** Create a task; `setup` can fill in more of the editor first. */
export async function addCard(page: Page, title: string, setup?: (dialog: Locator) => Promise<void>) {
  const dialog = await startCard(page, title)
  await setup?.(dialog)
  await dialog.getByRole("button", { name: "Create task", exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

/** The task editor's execution settings and dependencies are folded away. */
export async function openTaskSettings(dialog: Locator) {
  const details = dialog.locator("details.agora-task-fields")
  if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await dialog.getByText("Execution and dependencies", { exact: true }).click()
}

export async function openBoardAction(page: Page, action: string | RegExp) {
  await board(page).getByRole("button", { name: "Board actions", exact: true }).click()
  await page.getByRole("button", { name: action }).click()
  // Some actions leave the menu open; close it so it covers nothing.
  if (await page.getByRole("button", { name: "Export backup" }).isVisible()) await page.keyboard.press("Escape")
}
