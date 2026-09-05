import { test, expect, type Page } from "@playwright/test"
const KEY = "agora.board.v1"
const board = (page: Page) => page.getByLabel("Agora board", { exact: true })
async function add(page: Page, title: string, description = "") {
  await board(page).getByRole("button", { name: "New card", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Title", { exact: true }).fill(title)
  await dialog.getByLabel("Details", { exact: true }).fill(description)
  await dialog.getByRole("button", { name: "Create card", exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(board(page).getByRole("button", { name: "New card", exact: true })).toBeEnabled()
})

test("create, edit, move, reload, archive, restore and delete a card", async ({ page }) => {
  await expect(board(page).locator(".agora-card")).toHaveCount(0)
  await add(page, "Ship the card system", "Keep this context\nAnd this second line")
  await board(page).getByRole("button", { name: "Edit Ship the card system", exact: true }).click()
  await page.getByRole("dialog").getByLabel("Title", { exact: true }).fill("Ship the working board")
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click()
  await board(page)
    .getByLabel("Move Ship the working board to column", { exact: true })
    .selectOption("doing")
  await page.reload()
  const doing = board(page).getByRole("region", { name: "Doing column", exact: true })
  await expect(
    doing.getByRole("button", { name: "Edit Ship the working board", exact: true }),
  ).toBeVisible()
  await doing.getByRole("button", { name: "Edit Ship the working board", exact: true }).click()
  await expect(page.getByRole("dialog").getByLabel("Details", { exact: true })).toHaveValue(
    "Keep this context\nAnd this second line",
  )
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
  await board(page)
    .getByRole("button", { name: "Archive Ship the working board", exact: true })
    .click()
  await expect(board(page).locator(".agora-card")).toHaveCount(0)
  await board(page).getByRole("button", { name: "Archive (1)", exact: true }).click()
  await board(page)
    .getByRole("button", { name: "Restore Ship the working board", exact: true })
    .click()
  await expect(doing.locator(".agora-card")).toHaveCount(1)
  await board(page)
    .getByRole("button", { name: "Archive Ship the working board", exact: true })
    .click()
  await board(page)
    .getByRole("button", { name: "Delete Ship the working board permanently", exact: true })
    .click()
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(
    board(page).getByRole("button", { name: "Restore Ship the working board", exact: true }),
  ).toBeVisible()
  await board(page)
    .getByRole("button", { name: "Delete Ship the working board permanently", exact: true })
    .click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click()
  await page.reload()
  await expect(board(page).locator(".agora-card")).toHaveCount(0)
  await expect(board(page).getByRole("button", { name: "Archive (0)", exact: true })).toBeVisible()
})

test("cancel and invalid titles do not create or overwrite cards", async ({ page }) => {
  await board(page).getByRole("button", { name: "New card", exact: true }).click()
  await page.getByRole("dialog").getByLabel("Title", { exact: true }).fill("   ")
  await page.getByRole("dialog").getByRole("button", { name: "Create card", exact: true }).click()
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("title")
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(board(page).locator(".agora-card")).toHaveCount(0)
  await add(page, "Keep me")
  await board(page).getByRole("button", { name: "Edit Keep me", exact: true }).click()
  await page.getByRole("dialog").getByLabel("Title", { exact: true }).fill("Discard this draft")
  await page.keyboard.press("Escape")
  await expect(board(page).getByRole("button", { name: "Edit Keep me", exact: true })).toBeVisible()
})

test("keyboard controls reorder cards and preserve order after reload", async ({ page }) => {
  await add(page, "First")
  await add(page, "Second")
  await add(page, "Third")
  const move = board(page).getByRole("button", { name: "Move Third up", exact: true })
  await move.focus()
  await page.keyboard.press("Enter")
  await move.focus()
  await page.keyboard.press("Enter")
  await expect(board(page).locator('[data-column="backlog"] .agora-card-title')).toHaveText([
    "Third",
    "First",
    "Second",
  ])
  await page.reload()
  await expect(board(page).locator('[data-column="backlog"] .agora-card-title')).toHaveText([
    "Third",
    "First",
    "Second",
  ])
})

test("pointer drag moves between columns and reorders", async ({ page }, info) => {
  test.skip(info.project.name === "pages-mobile", "Touch drag is exercised separately")
  await add(page, "Drag first")
  await add(page, "Drag second")
  await add(page, "Drag third")
  const source = board(page).getByRole("button", { name: "Drag Drag first", exact: true })
  const target = board(page).locator('[data-column="todo"]')
  await board(page).scrollIntoViewIfNeeded()
  await source.scrollIntoViewIfNeeded()
  const from = (await source.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 12, from.y + 12, { steps: 3 })
  await page.mouse.move(to.x + to.width / 2, to.y + 90, { steps: 20 })
  await page.mouse.up()
  await expect(target.getByRole("button", { name: "Edit Drag first", exact: true })).toBeVisible()
  const handle = board(page).getByRole("button", { name: "Drag Drag third", exact: true })
  const before = board(page).getByRole("button", { name: "Edit Drag second", exact: true })
  await board(page).scrollIntoViewIfNeeded()
  await handle.click({ trial: true })
  const start = (await handle.boundingBox())!
  const end = (await before.boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 3 })
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 15 })
  await page.mouse.up()
  await expect(board(page).locator('[data-column="backlog"] .agora-card-title')).toHaveText([
    "Drag third",
    "Drag second",
  ])
  await page.reload()
  await expect(board(page).locator('[data-column="todo"] .agora-card-title')).toHaveText([
    "Drag first",
  ])
})

test("exports a backup and imports without deleting existing cards", async ({ page }) => {
  await add(page, "Original card", "Original details")
  const downloadPromise = page.waitForEvent("download")
  await board(page).getByRole("button", { name: "Export", exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^agora-board-/)
  const saved = await page.evaluate((key) => localStorage.getItem(key), KEY)
  const backup = JSON.parse(saved!)
  backup.cards[0].id = "imported-card"
  backup.cards[0].title = "Imported card"
  await board(page)
    .getByLabel("Import board backup", { exact: true })
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    })
  await expect(board(page).locator(".agora-card")).toHaveCount(2)
  await board(page)
    .getByLabel("Import board backup", { exact: true })
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("invalid"),
    })
  await expect(board(page).getByRole("alert")).toContainText("existing board has not changed")
  await page.reload()
  await expect(board(page).locator(".agora-card")).toHaveCount(2)
})

test("corrupt saved data is left untouched", async ({ page }) => {
  await page.evaluate((key) => localStorage.setItem(key, "{corrupt data"), KEY)
  await page.reload()
  await expect(board(page).getByRole("alert")).toContainText("left untouched")
  await expect(board(page).getByRole("button", { name: "New card", exact: true })).toBeDisabled()
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("{corrupt data")
})

test("mobile layout stays within the viewport and supports touch creation", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "pages-mobile", "Mobile only")
  await board(page).getByRole("button", { name: "New card", exact: true }).tap()
  await page.getByRole("dialog").getByLabel("Title", { exact: true }).fill("Touch card")
  await page.getByRole("dialog").getByRole("button", { name: "Create card", exact: true }).tap()
  await expect(
    board(page).getByRole("button", { name: "Edit Touch card", exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test("touch dragging reorders mobile cards without losing details", async ({ page }, info) => {
  test.skip(info.project.name !== "pages-mobile", "Mobile touch only")
  await add(page, "Touch first", "First details")
  await add(page, "Touch second", "Second details")
  const source = board(page).getByRole("button", { name: "Drag Touch second", exact: true })
  await source.scrollIntoViewIfNeeded()
  const from = (await source.boundingBox())!
  const to = (await board(page)
    .getByRole("button", { name: "Edit Touch first", exact: true })
    .boundingBox())!
  const session = await page.context().newCDPSession(page)
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] })
  for (let step = 1; step <= 15; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: start.x + ((end.x - start.x) * step) / 15,
          y: start.y + ((end.y - start.y) * step) / 15,
        },
      ],
    })
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await expect(board(page).locator('[data-column="backlog"] .agora-card-title')).toHaveText([
    "Touch second",
    "Touch first",
  ])
  await page.reload()
  await expect(board(page).locator('[data-column="backlog"] .agora-card-description')).toHaveText([
    "Second details",
    "First details",
  ])
})

test("another tab's cards survive subsequent edits", async ({ page, context }) => {
  const other = await context.newPage()
  await other.goto(page.url())
  await expect(board(other).getByRole("button", { name: "New card", exact: true })).toBeEnabled()
  await add(page, "From tab one")
  await expect(
    board(other).getByRole("button", { name: "Edit From tab one", exact: true }),
  ).toBeVisible()
  await add(other, "From tab two")
  await expect(board(page).locator(".agora-card")).toHaveCount(2)
  await page.reload()
  await expect(board(page).locator(".agora-card")).toHaveCount(2)
  await other.close()
})

test("warm light theme preserves board data and dialog contrast", async ({ page }, info) => {
  await add(page, "Theme-safe card", "Readable in both themes")
  await page
    .getByRole("button", {
      name:
        info.project.name === "app-desktop"
          ? "Switch to light mode"
          : "Theme: dark. Switch to light mode",
      exact: true,
    })
    .filter({ visible: true })
    .click()
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(240, 238, 230)")
  await expect(board(page).locator(".agora-card")).toHaveCSS(
    "background-color",
    "rgb(240, 238, 230)",
  )
  await board(page).getByRole("button", { name: "Edit Theme-safe card", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(240, 238, 230)")
  await expect(page.getByRole("dialog").getByLabel("Details", { exact: true })).toHaveValue(
    "Readable in both themes",
  )
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
  await page.reload()
  await expect(
    board(page).getByRole("button", { name: "Edit Theme-safe card", exact: true }),
  ).toBeVisible()
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(240, 238, 230)")
  await board(page).scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath("warm-board.png") })
})
