import { randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, copyFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test, expect, type Page, type APIRequestContext } from "@playwright/test"
const token = "suggestions-api-token-2026-at-least-32-characters"
const headers = { Authorization: `Bearer ${token}` }
async function login(page: Page) {
  await page.goto("http://127.0.0.1:4291/")
  await page.getByLabel("Shared password").fill("browser-test-password-2026")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible()
}
async function propose(request: APIRequestContext, title: string) {
  const response = await request.post("/api/suggestions", { headers, data: { draft: { title, description: "Agent context", model: "default", type: "task" }, reason: "A concrete improvement" } })
  expect(response.status()).toBe(201)
  return (await response.json()).suggestion
}
async function open(page: Page, title: string) {
  await page.getByRole("button", { name: /^Suggestions \(/ }).click()
  const dialog = page.getByRole("dialog", { name: "Suggestions inbox" })
  await dialog.getByRole("button", { name: new RegExp(title) }).click()
  await expect(dialog.getByLabel("Proposed title")).toHaveValue(title)
  return dialog
}
test("agent proposal becomes one reviewed card visible in another authenticated browser", async ({ page, request, browser }, info) => {
  const title = `Review ${randomUUID().slice(0, 8)}`
  const suggestion = await propose(request, title)
  expect((await request.post(`/api/suggestions/${suggestion.id}/accept`, { headers, data: {} })).status()).toBe(403)
  await login(page)
  const secondContext = await browser.newContext()
  try {
    const second = await secondContext.newPage(); await login(second)
    const dialog = await open(page, title)
    await dialog.getByLabel("Proposed title").fill(`${title} reviewed`)
    await dialog.getByLabel("Details", { exact: true }).fill("Human-approved details")
    await dialog.getByRole("button", { name: "Save review draft" }).click()
    await expect(dialog.getByText("Version 2", { exact: false })).toBeVisible()
    await page.screenshot({ path: info.outputPath("suggestions-review.png"), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await dialog.getByRole("button", { name: "Accept into board" }).click()
    await expect(dialog.getByRole("heading", { name: "Accepted into the board" })).toBeVisible()
    await expect(second.getByRole("button", { name: `Edit ${title} reviewed`, exact: true })).toBeVisible()
    const detail = (await (await request.get(`/api/suggestions/${suggestion.id}`, { headers })).json()).suggestion
    expect(detail).toMatchObject({ state: "accepted", version: 3, author: { name: "proposal-agent", kind: "token" }, proposal: { title }, reviewedDraft: { title: `${title} reviewed` } })
    await dialog.getByRole("button", { name: "Open accepted card" }).click()
    await expect(page.getByRole("dialog").getByLabel("Title", { exact: true })).toHaveValue(`${title} reviewed`)
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
    await page.reload()
    await expect(page.getByRole("button", { name: `Edit ${title} reviewed`, exact: true })).toBeVisible()
  } finally { await secondContext.close() }
})
test("conflicting board revisions and network failures preserve review drafts", async ({ page, request }) => {
  const title = `Conflict ${randomUUID().slice(0, 8)}`
  const suggestion = await propose(request, title)
  await login(page)
  const dialog = await open(page, title)
  await dialog.getByLabel("Proposed title").fill(`${title} retained`)
  const snapshot = await (await request.get("/api/board", { headers })).json()
  const change = await request.post("/api/board", { headers, data: { revision: snapshot.revision, action: { type: "create", id: randomUUID(), draft: { title: "Concurrent board change", description: "", column: "backlog" } } } })
  expect(change.ok()).toBe(true)
  await dialog.getByRole("button", { name: "Accept into board" }).click()
  await expect(dialog.getByRole("button", { name: "Refresh review" })).toBeVisible()
  await expect(dialog.getByLabel("Proposed title")).toHaveValue(`${title} retained`)
  await dialog.getByRole("button", { name: "Refresh review" }).click()
  await expect(dialog.getByRole("button", { name: "Accept into board" })).toBeEnabled()
  await page.route(`**/api/suggestions/${suggestion.id}/accept`, route => route.abort())
  await dialog.getByRole("button", { name: "Accept into board" }).click()
  await expect(dialog.getByRole("alert")).toBeVisible()
  await expect(dialog.getByLabel("Proposed title")).toHaveValue(`${title} retained`)
  await page.unroute(`**/api/suggestions/${suggestion.id}/accept`)
  await dialog.getByRole("button", { name: "Accept into board" }).click()
  await expect(dialog.getByRole("heading", { name: "Accepted into the board" })).toBeVisible()
})
test("dismissal retains history, empty inbox and retry work with keyboard", async ({ page, request }) => {
  const title = `Dismiss ${randomUUID().slice(0, 8)}`
  await propose(request, title); await login(page)
  const dialog = await open(page, title)
  await dialog.getByLabel("Dismissal note (optional)").fill("Already covered")
  await dialog.getByRole("button", { name: "Dismiss suggestion" }).focus()
  await page.keyboard.press("Enter")
  await expect(dialog.getByRole("heading", { name: "Suggestion dismissed" })).toBeVisible()
  await expect(dialog.getByText("No pending suggestions.", { exact: false })).toBeVisible()
  await dialog.getByLabel("Review status").selectOption("dismissed")
  await dialog.getByRole("button", { name: new RegExp(title) }).click()
  await expect(dialog.getByText("Already covered", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible()
  await page.route("**/api/suggestions?**", route => route.abort())
  await page.getByRole("button", { name: /^Suggestions \(/ }).click()
  await expect(dialog.getByRole("button", { name: "Retry inbox" })).toBeVisible()
  await page.unroute("**/api/suggestions?**")
  await dialog.getByRole("button", { name: "Retry inbox" }).click()
  await expect(dialog.getByRole("button", { name: "Retry inbox" })).not.toBeVisible()
})
test("standalone copied CLI submits, lists and reads authenticated proposals", async ({ request, page }, info) => {
  test.skip(info.project.name === "mobile", "CLI has no device-dependent behavior")
  const directory = await mkdtemp(join(tmpdir(), "agora-suggestions-cli-"))
  try {
    const executable = join(directory, "agora.mjs"); await copyFile(resolve("cli/agora.mjs"), executable)
    const env = { ...process.env, AGORA_CONFIG: join(directory, "missing-config.json"), AGORA_URL: "http://127.0.0.1:4291", AGORA_TOKEN: token }
    const cli = async (args: string[]) => JSON.parse((await promisify(execFile)(process.execPath, [executable, ...args], { cwd: directory, env })).stdout)
    const title = `CLI ${randomUUID().slice(0, 8)}`
    const { suggestion } = await cli(["suggest", "--title", title, "--reason", "CLI proposal"])
    expect(suggestion.author).toEqual({ name: "proposal-agent", kind: "token" })
    expect((await cli(["suggestions", "list", "--state", "pending"])).suggestions.some((item: { id: string }) => item.id === suggestion.id)).toBe(true)
    expect((await cli(["suggestions", "get", suggestion.id])).suggestion.proposal.title).toBe(title)
    // A human browser reviews the CLI proposal in the same way as HTTP submissions.
    const response = await request.get(`/api/suggestions/${suggestion.id}`, { headers }); expect(response.ok()).toBe(true)
    await login(page); const dialog = await open(page, title)
    await dialog.getByRole("button", { name: "Dismiss suggestion" }).click()
    await expect(dialog.getByRole("heading", { name: "Suggestion dismissed" })).toBeVisible()
  } finally { await rm(directory, { recursive: true, force: true }) }
})
