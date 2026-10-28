import { test, expect } from "@playwright/test"
import { card, choose, editor, openTaskSettings, signIn } from "../helpers/workspace"
const token = "browser-api-token-2026-at-least-32-characters"
test("rich task fields, dependencies, authenticated comments and dispatch gates survive reload", async ({ page, request }) => {
  const auth = { Authorization: `Bearer ${token}` }
  let state = await (await request.get("/api/board", { headers: auth })).json()
  const create = async (id: string, title: string, type: string) => {
    const response = await request.post("/api/board", { headers: auth, data: { revision: state.revision, action: { type: "create", id, draft: { title, description: "", column: "todo", type } } } })
    expect(response.ok()).toBe(true)
    state = await response.json()
  }
  // A task nests under a higher level of work, so the parent is an epic.
  await create("rich-parent", "Rich parent", "epic")
  await create("rich-child", "Rich child", "task")
  await signIn(page)
  // Earlier specs leave cards in Todo; past the first few a column shows titles only and folds subtasks away.
  await page.getByRole("button", { name: /^Full cards:/ }).click()
  await page.getByRole("button", { name: "All cards", exact: true }).click()
  await page.keyboard.press("Escape")
  await card(page, "Rich child").click({ position: { x: 4, y: 4 } })
  let dialog = editor(page)
  await choose(dialog, "Assignee", "Claude")
  await choose(dialog, "Type", "Task")
  await openTaskSettings(dialog)
  await choose(dialog, "Effort", "high")
  await choose(dialog, "Model", "default")
  await choose(dialog, "Harness", "codex")
  await dialog.getByLabel("PR URL", { exact: true }).fill("https://github.com/example/repo/pull/1")
  await choose(dialog, "Parent card", "Rich parent")
  await dialog.getByRole("checkbox", { name: "Rich parent", exact: true }).check()
  await dialog.getByRole("checkbox", { name: "Human review required before work", exact: true }).check()
  await dialog.getByRole("checkbox", { name: "Allow automatic merge after review", exact: true }).check()
  // Dispatch only ever sends the saved task, never a draft still being saved.
  await expect(dialog.getByRole("button", { name: "Dispatch saved task" })).toBeDisabled()
  await dialog.getByRole("button", { name: "Save now", exact: true }).click()
  await expect(dialog.locator(".agora-editor-save")).toHaveText("Saved")
  await expect(dialog.getByRole("button", { name: "Dispatch saved task" })).toBeEnabled()
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.reload()
  // The child now sits under its epic on the board.
  await card(page, "Rich child").click({ position: { x: 4, y: 4 } })
  dialog = editor(page)
  await expect(dialog.getByRole("combobox", { name: "Assignee", exact: true })).toHaveText("Claude")
  await openTaskSettings(dialog)
  await expect(dialog.getByRole("checkbox", { name: "Rich parent", exact: true })).toBeChecked()
  await expect(dialog.getByLabel("PR URL", { exact: true })).toHaveValue("https://github.com/example/repo/pull/1")
  await dialog.getByLabel("Add a comment", { exact: true }).fill("Keep this authenticated note")
  await dialog.getByRole("button", { name: "Comment", exact: true }).click()
  await expect(dialog.locator("p").filter({ hasText: /^Keep this authenticated note$/ })).toBeVisible()
  await dialog.getByRole("button", { name: "Dispatch saved task" }).click()
  await expect(dialog.getByRole("region", { name: "Dispatch" }).getByRole("status")).toContainText("Human review")
  const saved = await (await request.get("/api/cards/rich-child", { headers: auth })).json()
  expect(saved.card).toMatchObject({ type: "task", parentId: "rich-parent", dependencies: ["rich-parent"], effort: "high", model: "default", harness: "codex", automerge: true, needsHumanReview: true })
  expect(saved.card.comments.at(-1)).toMatchObject({ author: "you", body: "Keep this authenticated note" })
})
