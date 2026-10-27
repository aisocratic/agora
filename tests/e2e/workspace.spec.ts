import { test, expect, type Page } from "@playwright/test"

/** The Next app mounts the workspace presentation at `/`, the same one the
    published demo embeds. These cover it end to end on browser storage. */
const board = (page: Page) => page.getByLabel("Agora board", { exact: true })
const column = (page: Page, label: string) => board(page).getByRole("region", { name: `${label} column`, exact: true })

async function add(page: Page, title: string, description = "", type = "Task") {
  await board(page).getByRole("button", { name: "Add card", exact: true }).click()
  await page.getByRole("button", { name: type, exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill(title)
  if (description) await dialog.getByRole("textbox", { name: "Description", exact: true }).fill(description)
  await dialog.getByRole("button", { name: `Create ${type.toLowerCase()}`, exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/board$/)
  await expect(board(page).getByRole("button", { name: "Add card", exact: true })).toBeEnabled()
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

  // Each section is its own page.
  await board(page).getByRole("link", { name: "Projects", exact: true }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(board(page).getByLabel("Project cards")).toBeVisible()
  await expect(board(page).getByText("Plan me", { exact: true })).toBeVisible()
  await board(page).getByRole("link", { name: "Calendar", exact: true }).click()
  await expect(page).toHaveURL(/\/calendar$/)
  await expect(board(page).getByLabel("Project calendar")).toBeVisible()
  await board(page).getByRole("link", { name: "List", exact: true }).click()
  await expect(page).toHaveURL(/\/list$/)
  await expect(board(page).getByLabel("Project list").getByRole("cell", { name: "Plan me" })).toBeVisible()
  await board(page).getByRole("link", { name: "Board", exact: true }).click()
  await expect(page).toHaveURL(/\/board$/)
  await expect(column(page, "Todo").getByText("Plan me", { exact: true })).toBeVisible()

  // Backlog is hidden by default; the column menu brings it back.
  await expect(column(page, "Backlog")).toHaveCount(0)
  await board(page).getByRole("button", { name: /columns$/ }).click()
  await page.getByRole("checkbox", { name: "Backlog", exact: true }).check()
  await page.keyboard.press("Escape")
  await expect(column(page, "Backlog")).toBeVisible()
})

test("a project opens on its own page with only its cards", async ({ page }) => {
  await add(page, "Frontier Stack", "", "Project")
  await add(page, "Outside work")
  await board(page).getByRole("link", { name: "Projects", exact: true }).click()
  await board(page).getByRole("link", { name: "View project Frontier Stack", exact: true }).click()
  await expect(page).toHaveURL(/\/project\/frontier-stack$/)
  await expect(page.getByRole("navigation", { name: "Project" }).getByText("Frontier Stack", { exact: true })).toBeVisible()

  // New work added here lands in the project; work outside it stays hidden.
  await add(page, "Book the venue")
  await expect(column(page, "Todo").getByText("Book the venue", { exact: true })).toBeVisible()
  await expect(board(page).getByText("Outside work", { exact: true })).toHaveCount(0)
  // The project's sections keep the scope; All projects drops it.
  await board(page).getByRole("link", { name: "Projects", exact: true }).click()
  await expect(page).toHaveURL(/\/project\/frontier-stack\/projects$/)
  await expect(board(page).getByLabel("Project cards").getByText("Outside work", { exact: true })).toHaveCount(0)
  await page.getByRole("link", { name: "All projects", exact: true }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(board(page).getByLabel("Project cards").getByText("Outside work", { exact: true })).toBeVisible()
  await board(page).getByRole("link", { name: "Board", exact: true }).click()
  // On the main kanban, the venue task names its project.
  const venue = column(page, "Todo").getByRole("article", { name: "Book the venue" })
  await expect(venue.getByRole("link", { name: "Frontier Stack", exact: true })).toHaveAttribute("href", "/project/frontier-stack")
})

test("a project cover uploads, shrinks to fit, and can be removed", async ({ page }) => {
  await add(page, "Cover test", "", "Project")
  await board(page).getByRole("link", { name: "Projects", exact: true }).click()
  await board(page).getByRole("button", { name: "Change cover for Cover test", exact: true }).click()
  // A real 1200×600 PNG goes through the browser's canvas and comes back small.
  const png = await page.evaluate(async () => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 1200, height: 600 })
    const context = canvas.getContext("2d")!
    context.fillStyle = "#7c3aed"
    context.fillRect(0, 0, 1200, 600)
    return canvas.toDataURL("image/png").split(",")[1]
  })
  await page.getByLabel("Cover image file").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") })
  const tile = board(page).getByRole("button", { name: "Change cover for Cover test", exact: true }).locator("img")
  await expect(tile).toHaveAttribute("src", /^data:image\/(webp|png);base64,/)
  const size = await tile.evaluate(image => new Promise<[number, number]>(resolve => {
    const probe = new Image()
    probe.onload = () => resolve([probe.naturalWidth, probe.naturalHeight])
    probe.src = (image as HTMLImageElement).src
  }))
  expect(size).toEqual([480, 240])

  await page.reload()
  await expect(tile).toHaveAttribute("src", /^data:image\//)
  await board(page).getByRole("button", { name: "Change cover for Cover test", exact: true }).click()
  await page.getByRole("button", { name: "Remove", exact: true }).click()
  await expect(tile).toHaveCount(0)
})

test("each section and project page loads straight from its URL", async ({ page }) => {
  for (const [path, label] of [["/projects", "Project cards"], ["/calendar", "Project calendar"], ["/list", "Project list"]] as const) {
    await page.goto(path)
    await expect(board(page).getByLabel(label)).toBeVisible()
  }
  await page.goto("/project/no-such-project/calendar")
  await expect(page.getByRole("navigation", { name: "Project" }).getByRole("alert")).toContainText("No project matches")
  const missing = await page.goto("/project/no-such-project/nope")
  expect(missing?.status()).toBe(404)
})

test("projects reorder by drag and the project column resizes, and both stick", async ({ page }) => {
  await add(page, "Alpha", "", "Project")
  await add(page, "Beta", "", "Project")
  await board(page).getByRole("link", { name: "Projects", exact: true }).click()
  const projects = board(page).getByLabel("Project cards")
  const names = () => projects.getByRole("heading", { level: 3 }).allTextContents()
  await expect.poll(names).toEqual(["Alpha", "Beta"])

  // Drag Beta's grip above Alpha.
  const grip = await projects.getByRole("button", { name: "Reorder Beta", exact: true }).boundingBox()
  const target = await projects.getByRole("button", { name: "Reorder Alpha", exact: true }).boundingBox()
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2)
  await page.mouse.down()
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2 - 20, { steps: 12 })
  await page.mouse.up()
  await expect.poll(names).toEqual(["Beta", "Alpha"])

  // Drag the column's edge 120px wider.
  const handle = projects.getByRole("separator", { name: "Resize the project column" })
  await expect(handle).toHaveAttribute("aria-valuenow", "460")
  const edge = await handle.boundingBox()
  await page.mouse.move(edge!.x + edge!.width / 2, edge!.y + edge!.height / 2)
  await page.mouse.down()
  await page.mouse.move(edge!.x + edge!.width / 2 + 120, edge!.y + edge!.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(handle).toHaveAttribute("aria-valuenow", "580")

  await page.reload()
  await expect.poll(names).toEqual(["Beta", "Alpha"])
  await expect(handle).toHaveAttribute("aria-valuenow", "580")
})

test("a timeline marker leads to its card on the board, and Scope opens a project's page", async ({ page }) => {
  await add(page, "Alpha", "", "Project")
  await add(page, "Find me")
  await board(page).getByRole("link", { name: "Projects", exact: true }).click()
  const marker = board(page).getByRole("link", { name: "Find me: show on the board", exact: true }).first()
  await marker.hover()
  await expect(page.getByRole("tooltip")).toContainText("Find me")
  await expect(page.getByRole("tooltip")).toContainText("Click to show it on the board")
  await marker.click()
  // The board opens with the card selected; the address is tidied afterwards.
  await expect(page).toHaveURL(/\/board$/)
  await expect(column(page, "Todo").getByRole("article", { name: "Find me" })).toHaveAttribute("data-selected", "true")

  await board(page).getByRole("button", { name: "Scope", exact: true }).click()
  await page.getByRole("dialog", { name: "Scope" }).getByRole("link", { name: "Alpha", exact: true }).click()
  await expect(page).toHaveURL(/\/project\/alpha$/)
  await expect(page.getByRole("region", { name: "Project: Alpha" }).getByRole("heading", { level: 1, name: "Alpha" })).toBeVisible()
  await expect(board(page).getByRole("button", { name: "Scope: Alpha", exact: true })).toBeVisible()
})


test("a box dragged over cards selects them, and dragging one moves them together", async ({ page }) => {
  for (const title of ["First pick", "Second pick", "Left behind"]) await add(page, title)
  const todo = column(page, "Todo")
  const card = (title: string) => todo.getByRole("article", { name: title })
  const area = (await todo.boundingBox())!
  const first = (await card("First pick").boundingBox())!
  const second = (await card("Second pick").boundingBox())!
  const behind = (await card("Left behind").boundingBox())!
  // Order follows the column's sort; sweep from the gap beside the column over whichever two sit above the third.
  const [top, bottom] = [first, second, behind].sort((a, b) => a.y - b.y)
  await page.mouse.move(area.x + area.width + 8, top.y + 4)
  await page.mouse.down()
  await page.mouse.move(top.x + 24, bottom.y + bottom.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(board(page).getByText("2 selected", { exact: true })).toBeVisible()
  const selected = await todo.locator('.agora-card[data-selected="true"]').evaluateAll(cards => cards.map(item => item.getAttribute("aria-label")))
  expect(selected).toHaveLength(2)

  // Pick up one selected card; the other travels with it to Review.
  const grab = (await todo.getByRole("article", { name: selected[0]! }).boundingBox())!
  const review = (await column(page, "Review").boundingBox())!
  await page.mouse.move(grab.x + grab.width / 2, grab.y + 12)
  await page.mouse.down()
  await page.mouse.move(grab.x + grab.width / 2 + 12, grab.y + 24, { steps: 3 })
  await expect(page.locator(".agora-drag-count")).toHaveText("2")
  await page.mouse.move(review.x + review.width / 2, review.y + 60, { steps: 15 })
  await page.mouse.up()
  for (const title of selected) await expect(column(page, "Review").getByRole("article", { name: title! })).toBeVisible()
  await expect(todo.locator(".agora-card")).toHaveCount(1)
  await page.reload()
  await expect(column(page, "Review").locator(".agora-card")).toHaveCount(2)
})
