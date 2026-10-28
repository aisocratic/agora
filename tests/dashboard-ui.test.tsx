// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Board, type WorkspacePage } from "../components/board/board"
import { BoardStore } from "../lib/board-storage"
import { DEMO_BOARD, DEMO_WORKFLOW } from "../lib/demo-board"
import { TaskFields } from "../components/board/task-fields"
import type { BoardCard, BoardData } from "../lib/board"

// Real image decoding needs a canvas, which jsdom lacks; uploads resolve to a stub.
vi.mock("../lib/cover-image", () => ({ coverFromFile: vi.fn(async () => "data:image/webp;base64,AAAA") }))

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", "") }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open") }
  const saved = new Map<string, string>()
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
    clear: () => saved.clear(),
  } })
})
afterEach(() => { cleanup(); vi.useRealTimers() })
// Picked by title, not index, so seeding a new demo card cannot silently
// reshape this fixture. Links are dropped: these cards stand on their own.
function mountBoard() {
  const pick = (title: string) => {
    const card = DEMO_BOARD.cards.find(card => card.title === title)
    if (!card) throw new Error(`The demo board no longer has a card titled "${title}".`)
    return { ...card, parentId: null, dependencies: [] }
  }
  const project = pick("Agent-ready workspace")
  const data = { version: 1, cards: [
    ...Array.from({ length: 8 }, (_, index) => ({ ...pick("Add keyboard shortcuts"), id: `queued-${index}`, title: `Queued task ${index}`, column: "todo", priority: 1 })),
    { ...pick("Build the test dashboard"), parentId: project.id },
    pick("Review the empty states"), project, pick("Set up the shared design tokens"),
  ] }
  let raw = JSON.stringify(data)
  const store = new BoardStore({ read: () => raw, write: value => { raw = value }, subscribe: () => () => {} })
  return { ...render(<Board workspace store={store} workflow={DEMO_WORKFLOW} />), store }
}
it("starts with active columns and expands the compact remainder on demand", () => {
  const { container } = mountBoard()
  expect(screen.getByRole("region", { name: "Todo column" })).toBeVisible()
  expect(screen.queryByRole("region", { name: "Backlog column" })).not.toBeInTheDocument()
  expect(container.querySelectorAll('[data-column="todo"] [data-compact="true"]')).toHaveLength(3)
  fireEvent.click(screen.getByRole("button", { name: "show full size" }))
  expect(container.querySelectorAll('[data-column="todo"] [data-compact="true"]')).toHaveLength(0)
})
/* One project with sub-projects (one finished, one with a subtask) and a task
   of its own, plus a stray sub-project and a stray task. */
function mountProjects({ columns, stay, preferences, ...props }: { columns?: string[]; stay?: boolean; preferences?: Record<string, unknown>; scopeSlug?: string; projectHref?: (slug: string) => string; projectsHref?: string; page?: WorkspacePage; pageHref?: (page: WorkspacePage) => string; scopeHref?: (slug?: string) => string } = {}) {
  if (columns || preferences) window.localStorage.setItem("agora.test-dashboard.view.v2", JSON.stringify({ ...preferences, ...(columns ? { columns } : {}) }))
  const pick = (title: string, fields: Partial<BoardCard>) => {
    const card = DEMO_BOARD.cards.find(card => card.title === title)
    if (!card) throw new Error(`The demo board no longer has a card titled "${title}".`)
    return { ...card, parentId: null, dependencies: [], imageUrl: null, ...fields }
  }
  const data: BoardData = { version: 1, cards: [
    pick("Agent-ready workspace", { id: "p", type: "project", column: "doing", dueDate: null }),
    pick("Ship the dashboard", { id: "e-ship", type: "epic", column: "todo", parentId: "p", dueDate: "2026-10-23" }),
    pick("Build the test dashboard", { id: "t-build", type: "task", column: "doing", parentId: "e-ship", dueDate: "2026-10-16" }),
    pick("A workspace for humans and agents", { id: "e-workspace", type: "epic", column: "todo", parentId: "p", dueDate: "2026-12" }),
    pick("Public demo site", { id: "e-demo", type: "epic", column: "done", parentId: "p", dueDate: "2026-09-30" }),
    pick("Document the review workflow", { id: "t-doc", type: "task", column: "todo", parentId: "p", dueDate: null }),
    pick("Explore weekly planning", { id: "t-later", type: "task", column: "backlog", parentId: "p", dueDate: null }),
    pick("Codex adapter", { id: "e-codex", type: "epic", column: "todo", dueDate: null }),
    pick("Review the empty states", { id: "t-review", type: "task", column: "review", dueDate: "2026-10-20" }),
    pick("Agora launch", { id: "p2", type: "project", column: "todo", dueDate: null }),
  ] }
  let raw = JSON.stringify(data)
  const store = new BoardStore({ read: () => raw, write: value => { raw = value }, subscribe: () => () => {} })
  render(<Board workspace store={store} workflow={DEMO_WORKFLOW} {...props} />)
  if (props.scopeSlug || props.pageHref || stay) return { store, projects: undefined as never }
  fireEvent.click(screen.getByRole("button", { name: "Projects" }))
  return { store, projects: within(screen.getByLabelText("Project cards")) }
}
// A timeline row's main button; its assignee and marker buttons start with the title too.
const rowOf = (scope: ReturnType<typeof within>, title: string) => scope.getAllByRole("button", { name: new RegExp(`^${title}`) }).find((button: HTMLElement) => button.classList.contains("agora-timeline-item"))!
const card = (store: BoardStore, id: string) => store.getSnapshot().board.cards.find(item => item.id === id)
it("Projects opens on projects with their sub-projects and tasks; sub-projects fold their subtasks", () => {
  // The fixture's target dates are in October 2026: read them before they pass.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"))
  const { projects } = mountProjects()
  expect(projects.getByRole("button", { name: "Agent-ready workspace" })).toBeVisible()
  expect(projects.getByText("2 sub-projects · 2 tasks · next Oct 16, 2026")).toBeVisible()
  expect(projects.getByText("Ship the dashboard")).toBeVisible()
  expect(projects.getByText("Document the review workflow")).toBeVisible()
  expect(projects.getByText("Oct 23, 2026 · 1 subtask")).toBeVisible()
  expect(projects.queryByText("Build the test dashboard")).not.toBeInTheDocument()
  fireEvent.click(projects.getByRole("button", { name: "Expand Ship the dashboard" }))
  expect(projects.getByText("Build the test dashboard")).toBeVisible()
  fireEvent.click(projects.getByRole("button", { name: "Collapse Ship the dashboard" }))
  expect(projects.queryByText("Build the test dashboard")).not.toBeInTheDocument()
  // Work outside any project still has a home, and there is no collapse-all.
  expect(projects.getByText("Not in a project")).toBeVisible()
  expect(projects.getByText("Codex adapter")).toBeVisible()
  expect(projects.getByText("Review the empty states")).toBeVisible()
  expect(projects.queryByRole("button", { name: /Collapse all|Expand all/ })).not.toBeInTheDocument()
  expect(JSON.parse(window.localStorage.getItem("agora.test-dashboard.view.v2")!).view).toBe("project")
})
it("Projects shows only the columns selected in the toolbar", () => {
  const { projects } = mountProjects()
  // Backlog is off by default, so the backlog task stays out of the project.
  expect(projects.queryByText("Explore weekly planning")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: /columns$/ }))
  fireEvent.click(screen.getByRole("radio", { name: "Backlog: Always show" }))
  expect(projects.getByText("Explore weekly planning")).toBeVisible()
  // Hiding the project's own column keeps it heading the work still shown.
  fireEvent.click(screen.getByRole("radio", { name: "In Progress: Hide" }))
  expect(projects.getByRole("button", { name: "Agent-ready workspace" })).toBeVisible()
  expect(projects.getByText("Ship the dashboard")).toBeVisible()
})
it("shows each column always, only while it has cards, or never, and remembers the choice", async () => {
  const { store } = mountBoard()
  const columnsMenu = () => screen.getByRole("button", { name: /columns$/ })
  fireEvent.click(columnsMenu())
  expect(screen.getByRole("radio", { name: "Backlog: Hide" })).toHaveAttribute("aria-checked", "true")
  // An empty column set to hide when empty stays away; always brings it back empty.
  fireEvent.click(screen.getByRole("radio", { name: "Backlog: Hide when empty" }))
  expect(screen.queryByRole("region", { name: "Backlog column" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("radio", { name: "Backlog: Always show" }))
  expect(within(screen.getByRole("region", { name: "Backlog column" })).getByText(/No cards yet/)).toBeVisible()
  // A column with cards stays while it has them, and steps aside once it has none.
  fireEvent.click(screen.getByRole("radio", { name: "Review: Hide when empty" }))
  expect(screen.getByRole("region", { name: "Review column" })).toBeVisible()
  await store.dispatch({ type: "move", id: store.getSnapshot().board.cards.find(card => card.column === "review")!.id, column: "todo", position: 0 })
  await waitFor(() => expect(screen.queryByRole("region", { name: "Review column" })).not.toBeInTheDocument())
  expect(columnsMenu()).toHaveTextContent("4 of 6 columns")
  expect(JSON.parse(window.localStorage.getItem("agora.test-dashboard.view.v2")!)).toMatchObject({ columns: ["todo", "doing", "review", "backlog"], hideWhenEmpty: ["review"] })
  // Each column's own menu carries the same choice.
  fireEvent.click(screen.getByRole("button", { name: /^Backlog/ }))
  fireEvent.click(screen.getByRole("radio", { name: "Backlog: Hide" }))
  expect(screen.queryByRole("region", { name: "Backlog column" })).not.toBeInTheDocument()
  cleanup()
  mountBoard()
  // A fresh board has a Review card again, so Review is back; the choices stand.
  expect(screen.getByRole("region", { name: "Review column" })).toBeVisible()
  expect(screen.queryByRole("region", { name: "Backlog column" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: /columns$/ }))
  expect(screen.getByRole("radio", { name: "Review: Hide when empty" })).toHaveAttribute("aria-checked", "true")
  expect(screen.getByRole("region", { name: "Todo column" })).toBeVisible()
})
it("Projects folds a project and opens a sub-project's details before the card itself", () => {
  const { projects } = mountProjects()
  fireEvent.click(projects.getByRole("button", { name: "Collapse Agent-ready workspace" }))
  expect(projects.queryByText("Ship the dashboard")).not.toBeInTheDocument()
  fireEvent.click(projects.getByRole("button", { name: "Expand Agent-ready workspace" }))
  expect(projects.queryByRole("button", { name: /^Open epic/ })).not.toBeInTheDocument()
  fireEvent.click(rowOf(projects, "Ship the dashboard"))
  expect(projects.getByText("When")).toBeVisible()
  fireEvent.click(projects.getByRole("button", { name: /^Open epic/ }))
  expect(within(screen.getByRole("dialog")).getByRole("textbox", { name: "Title" })).toHaveValue("Ship the dashboard")
})
it("Projects filters by period, and the calendar lists dated work by day", () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"))
  const { projects } = mountProjects({ columns: ["todo", "doing", "review", "done"] })
  expect(projects.getByText("Oct 2026")).toBeVisible()
  expect(projects.queryByRole("button", { name: "List" })).not.toBeInTheDocument()
  // Upcoming is open work; the finished demo-site sub-project only shows under Past.
  expect(projects.queryByText("Public demo site")).not.toBeInTheDocument()
  fireEvent.click(projects.getByRole("button", { name: "Past" }))
  expect(projects.getByText("Public demo site")).toBeVisible()
  expect(projects.queryByText("Ship the dashboard")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Calendar" }))
  const calendar = within(screen.getByLabelText("Project calendar"))
  // October lists its dated work earliest first, tasks and sub-projects alike.
  const october = within(calendar.getByText("October 2026").closest("section")!)
  expect(october.getAllByRole("listitem").map(item => item.querySelector("strong")?.textContent)).toEqual(["Build the test dashboard", "Review the empty states", "Ship the dashboard"])
  fireEvent.click(calendar.getByRole("button", { name: "Later months" }))
  fireEvent.click(calendar.getByRole("button", { name: "Earlier months" }))
  const day = calendar.getByRole("button", { name: "October 2026 23: Ship the dashboard" })
  fireEvent.click(day)
  expect(day).toHaveAttribute("aria-pressed", "true")
  // Paging rebuilt the month, so look October up again before counting.
  expect(within(calendar.getByText("October 2026").closest("section")!).getAllByRole("listitem")).toHaveLength(1)
})
it("uploads, tones and removes a project cover from the timeline", async () => {
  const { store, projects } = mountProjects()
  fireEvent.click(projects.getByRole("button", { name: "Change cover for Agent-ready workspace" }))
  const file = new File(["logo"], "logo.png", { type: "image/png" })
  fireEvent.change(screen.getByLabelText("Cover image file"), { target: { files: [file] } })
  await waitFor(() => expect(card(store, "p")?.imageUrl).toBe("data:image/webp;base64,AAAA"))
  fireEvent.click(screen.getByRole("checkbox", { name: "Dark tile, for a white logo" }))
  await waitFor(() => expect(card(store, "p")?.imageUrl).toBe("data:image/webp;base64,AAAA#dark"))
  fireEvent.click(screen.getByRole("button", { name: "Remove" }))
  await waitFor(() => expect(card(store, "p")?.imageUrl).toBeNull())
})
it("edits a project's target month and cover link from the card editor", async () => {
  const { store, projects } = mountProjects()
  fireEvent.click(projects.getByRole("button", { name: "Agent-ready workspace" }))
  const dialog = within(screen.getByRole("dialog"))
  fireEvent.change(dialog.getByLabelText("Target date"), { target: { value: "2026-12-04" } })
  fireEvent.click(dialog.getByRole("checkbox", { name: "Day not set yet" }))
  expect(dialog.getByLabelText("Target date")).toHaveAttribute("type", "month")
  fireEvent.change(dialog.getByLabelText("Cover image"), { target: { value: "https://example.com/logo.svg" } })
  fireEvent.blur(dialog.getByLabelText("Cover image"))
  fireEvent.click(dialog.getByRole("button", { name: /^Save/ }))
  await waitFor(() => expect(card(store, "p")).toMatchObject({ dueDate: "2026-12", imageUrl: "https://example.com/logo.svg" }))
})
it("Add card creates any card type, starting with a project", async () => {
  const { store } = mountProjects()
  fireEvent.click(screen.getByRole("button", { name: "Add card" }))
  expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(expect.arrayContaining(["Task", "Bug", "Epic", "Project"]))
  fireEvent.click(screen.getByRole("button", { name: "Project" }))
  const dialog = within(screen.getByRole("dialog"))
  fireEvent.change(dialog.getByRole("textbox", { name: "Title" }), { target: { value: "Frontier Stack" } })
  fireEvent.click(dialog.getByRole("button", { name: "Create project" }))
  await waitFor(() => expect(store.getSnapshot().board.cards.find(item => item.title === "Frontier Stack")).toMatchObject({ type: "project", parentId: null }))
})
it("a project page shows only that project's cards on the kanban and files new work under it", async () => {
  const { store } = mountProjects({ scopeSlug: "agent-ready-workspace", projectHref: slug => `/project/${slug}`, projectsHref: "/" })
  const crumb = within(screen.getByRole("navigation", { name: "Project" }))
  expect(crumb.getByRole("link", { name: "All projects" })).toHaveAttribute("href", "/")
  expect(crumb.getByText("Agent-ready workspace")).toBeVisible()
  // The page opens with the project itself: name, where it stands, what is inside.
  const head = within(screen.getByRole("region", { name: "Project: Agent-ready workspace" }))
  expect(head.getByRole("heading", { level: 1, name: "Agent-ready workspace" })).toBeVisible()
  expect(head.getByText("In Progress")).toBeVisible()
  expect(head.getByText("3 sub-projects · 3 tasks")).toBeVisible()
  fireEvent.click(head.getByRole("button", { name: "Edit project" }))
  expect(within(screen.getByRole("dialog")).getByRole("textbox", { name: "Title" })).toHaveValue("Agent-ready workspace")
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close task" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(screen.getByRole("region", { name: "Todo column" })).toBeVisible()
  expect(screen.getByText("Build the test dashboard")).toBeVisible()
  expect(screen.queryByText("Review the empty states")).not.toBeInTheDocument()
  expect(screen.queryByText("Codex adapter")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Scope: Agent-ready workspace" })).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: "Add card" }))
  fireEvent.click(screen.getByRole("button", { name: "Task" }))
  const dialog = within(screen.getByRole("dialog"))
  fireEvent.change(dialog.getByRole("textbox", { name: "Title" }), { target: { value: "Scoped task" } })
  fireEvent.click(dialog.getByRole("button", { name: "Create task" }))
  await waitFor(() => expect(store.getSnapshot().board.cards.find(item => item.title === "Scoped task")?.parentId).toBe("p"))
})
it("rings each parent card with how much of the work under it is done, and puts the scope's share in the breadcrumb", () => {
  mountProjects({ scopeSlug: "agent-ready-workspace", projectHref: slug => `/project/${slug}`, projectsHref: "/" })
  // The project's leaves: the epic's one task (in progress), two loose tasks, an empty epic and a finished one.
  expect(within(screen.getByRole("navigation", { name: "Project" })).getByText("(20%)")).toBeVisible()
  const epic = screen.getByRole("button", { name: "Rename Ship the dashboard" }).closest("article")!
  expect(within(epic).getByRole("img", { name: "0 of 1 subtask done (0%)" })).toBeVisible()
  const leaf = screen.getByRole("button", { name: "Rename Document the review workflow" }).closest("article")!
  expect(within(leaf).queryByRole("img", { name: /subtasks? done/ })).not.toBeInTheDocument()
})
it("links each project to its page and says when a page's project is missing", () => {
  const { projects } = mountProjects({ projectHref: slug => `/project/${slug}` })
  const view = projects.getByRole("link", { name: "View project Agent-ready workspace" })
  expect(view).toHaveAttribute("href", "/project/agent-ready-workspace")
  expect(view).toHaveTextContent("")
  fireEvent.click(rowOf(projects, "Ship the dashboard"))
  expect(projects.getByRole("link", { name: "View epic board" })).toHaveAttribute("href", "/project/ship-the-dashboard")
  cleanup()
  mountProjects({ scopeSlug: "nope", projectHref: slug => `/project/${slug}` })
  expect(screen.getByRole("alert")).toHaveTextContent("No project matches “nope”. Showing all work.")
  expect(screen.getByText("Review the empty states")).toBeVisible()
})
it("selects cards with modifiers and moves and archives the selection together", async () => {
  const { store } = mountBoard()
  fireEvent.click(screen.getByRole("article", { name: "Queued task 0" }), { ctrlKey: true })
  fireEvent.click(screen.getByRole("button", { name: "Rename Queued task 1" }), { shiftKey: true })
  expect(screen.getByText("2 selected")).toBeVisible()
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  fireEvent.keyDown(screen.getByLabelText("Move selected cards"), { key: "Enter" })
  fireEvent.click(await screen.findByRole("option", { name: "Review" }))
  await waitFor(() => expect(store.getSnapshot().board.cards.filter(card => ["queued-0", "queued-1"].includes(card.id)).every(card => card.column === "review")).toBe(true))
  const actions = within(screen.getByLabelText("Selected card actions"))
  await waitFor(() => expect(actions.getByRole("button", { name: "Archive" })).toBeEnabled())
  fireEvent.click(actions.getByRole("button", { name: "Archive" }))
  await waitFor(() => expect(screen.queryByLabelText("Selected card actions")).not.toBeInTheDocument())
  expect(store.getSnapshot().board.cards.filter(card => card.archived)).toHaveLength(2)
})
it("selects the cards a dragged box touches, adds to the selection with Shift, and clears it on a click", () => {
  const { container } = mountBoard()
  // jsdom has no layout: place each Todo card in a 100px-tall row.
  const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-column="todo"] .agora-card'))
  rows.forEach((element, index) => { element.getBoundingClientRect = () => ({ left: 0, top: index * 100, width: 200, height: 90, right: 200, bottom: index * 100 + 90, x: 0, y: index * 100, toJSON: () => ({}) }) })
  const space = container.querySelector<HTMLElement>('[data-column="todo"] .agora-cards')!
  const sweep = (from: number, to: number, init: PointerEventInit = {}) => {
    fireEvent.pointerDown(space, { button: 0, pointerType: "mouse", clientX: 250, clientY: from, ...init })
    fireEvent.pointerMove(window, { clientX: 150, clientY: to })
    fireEvent.pointerUp(window)
  }
  sweep(10, 150)
  expect(screen.getByText("2 selected")).toBeVisible()
  expect(rows.slice(0, 2).every(element => element.dataset.selected === "true")).toBe(true)
  sweep(310, 330, { shiftKey: true })
  expect(screen.getByText("3 selected")).toBeVisible()
  // A press on a card is the card's own: never a marquee.
  fireEvent.pointerDown(rows[5], { button: 0, pointerType: "mouse", clientX: 50, clientY: 510 })
  fireEvent.pointerMove(window, { clientX: 60, clientY: 700 })
  fireEvent.pointerUp(window)
  expect(screen.getByText("3 selected")).toBeVisible()
  fireEvent.pointerDown(space, { button: 0, pointerType: "mouse", clientX: 250, clientY: 10 })
  fireEvent.pointerUp(window)
  expect(screen.queryByLabelText("Selected card actions")).not.toBeInTheDocument()
})
it("keeps selection and data intact when a bulk write fails", async () => {
  const { store } = mountBoard()
  vi.spyOn(store, "replace").mockRejectedValueOnce(new Error("Storage failed"))
  fireEvent.click(screen.getByRole("article", { name: "Queued task 0" }), { ctrlKey: true })
  fireEvent.keyDown(screen.getByLabelText("Selected cards priority"), { key: "Enter" })
  fireEvent.click(await screen.findByRole("option", { name: "High" }))
  await screen.findByRole("alert")
  expect(screen.getByText("1 selected")).toBeVisible()
  expect(store.getSnapshot().board.cards.find(card => card.id === "queued-0")?.priority).toBe(1)
})
it("autosaves edits and flushes the latest draft before closing", async () => {
  const { store } = mountBoard()
  fireEvent.click(screen.getByRole("article", { name: "Queued task 0" }))
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Saved task title" } })
  await waitFor(() => expect(store.getSnapshot().board.cards.find(card => card.id === "queued-0")?.title).toBe("Saved task title"))
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "The final keystrokes" } })
  fireEvent.click(screen.getByRole("button", { name: "Close task" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(store.getSnapshot().board.cards.find(card => card.id === "queued-0")?.description).toBe("The final keystrokes")
})
it("sets, shows, changes and removes a card's measurable goal", async () => {
  const { store } = mountBoard()
  const saved = () => store.getSnapshot().board.cards.find(card => card.id === "queued-0")?.progress
  fireEvent.click(screen.getByRole("article", { name: "Queued task 0" }))
  const dialog = within(screen.getByRole("dialog"))
  fireEvent.click(dialog.getByRole("button", { name: "Add measurable goal" }))
  fireEvent.change(dialog.getByLabelText("Progress label"), { target: { value: "Accounts found" } })
  fireEvent.change(dialog.getByLabelText("Completed"), { target: { value: "120" } })
  fireEvent.change(dialog.getByLabelText("Goal"), { target: { value: "100" } })
  fireEvent.click(dialog.getByRole("button", { name: "Save progress" }))
  expect(dialog.getByRole("alert")).toHaveTextContent("0 ≤ completed ≤ goal")
  fireEvent.change(dialog.getByLabelText("Completed"), { target: { value: "32" } })
  fireEvent.click(dialog.getByRole("button", { name: "Save progress" }))
  await waitFor(() => expect(saved()).toEqual({ label: "Accounts found", current: 32, total: 100 }))
  fireEvent.click(dialog.getByRole("button", { name: "Close task" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  const card = within(screen.getByRole("article", { name: "Queued task 0" }))
  expect(card.getByText("Accounts found 32/100 · 32%")).toBeVisible()
  expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "32")
  fireEvent.click(screen.getByRole("article", { name: "Queued task 0" }))
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Edit progress" }))
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove goal" }))
  await waitFor(() => expect(saved()).toBeNull())
})
it("reviews a card in review: request changes with feedback, or approve", async () => {
  const { store } = mountBoard()
  const reviewed = () => store.getSnapshot().board.cards.find(card => card.title === "Review the empty states")!
  // Only a card in review has the panel.
  fireEvent.click(screen.getByRole("article", { name: "Queued task 0" }))
  expect(within(screen.getByRole("dialog")).queryByRole("region", { name: "Review" })).not.toBeInTheDocument()
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close task" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole("article", { name: "Review the empty states" }))
  const panel = within(within(screen.getByRole("dialog")).getByRole("region", { name: "Review" }))
  expect(panel.getByRole("button", { name: "Request changes" })).toBeDisabled()
  fireEvent.change(panel.getByLabelText("Review feedback"), { target: { value: "Cover the empty search too" } })
  fireEvent.click(panel.getByRole("button", { name: "Request changes" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(reviewed()).toMatchObject({ column: "todo", reviewStatus: "changes_requested", reviewFeedback: "Cover the empty search too" })
  expect(reviewed().comments?.at(-1)).toMatchObject({ body: "Changes requested: Cover the empty search too", author: "You" })
  const card = within(screen.getByRole("region", { name: "Todo column" })).getByRole("article", { name: "Review the empty states" })
  expect(within(card).getByRole("img", { name: "Review: changes requested — Cover the empty search too" })).toBeVisible()
  // Back in review it needs a fresh verdict; approving with nothing to merge finishes it.
  await store.dispatch({ type: "move", id: reviewed().id, column: "review", position: 0 })
  fireEvent.click(screen.getByRole("article", { name: "Review the empty states" }))
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }))
  await waitFor(() => expect(reviewed()).toMatchObject({ column: "done", reviewStatus: "approved" }))
})
it("does not lose newer typing when an earlier autosave is in flight", async () => {
  const { store } = mountBoard()
  const dispatch = store.dispatch.bind(store)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  vi.spyOn(store, "dispatch").mockImplementationOnce(async action => { await gate; dispatch(action) })
  fireEvent.click(screen.getByRole("article", { name: "Queued task 0" }))
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "First draft" } })
  await screen.findByText("Saving…")
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Latest draft" } })
  release()
  await waitFor(() => expect(store.getSnapshot().board.cards.find(card => card.id === "queued-0")?.title).toBe("Latest draft"))
})

it("uses the Stoa select inside task details and saves its selected status", async () => {
  const { store } = mountBoard()
  fireEvent.click(screen.getByRole("article", { name: "Queued task 0" }))
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Status" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("option", { name: /^Done$/ }))
  fireEvent.click(screen.getByRole("button", { name: "Close task" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(store.getSnapshot().board.cards.find(card => card.id === "queued-0")?.column).toBe("done")
})

it("offers only higher levels as a parent: project > epic > task", () => {
  const board: BoardData = { version: 1, cards: [
    { ...DEMO_BOARD.cards[0], id: "p1", title: "A project", type: "project", parentId: null, dependencies: [] },
    { ...DEMO_BOARD.cards[0], id: "e1", title: "An epic", type: "epic", parentId: null, dependencies: [] },
    { ...DEMO_BOARD.cards[0], id: "t1", title: "A task", type: "task", parentId: null, dependencies: [] },
    { ...DEMO_BOARD.cards[0], id: "b1", title: "A bug", type: "bug", parentId: null, dependencies: [] },
  ] }
  const parentsFor = (type: string) => {
    cleanup()
    render(<TaskFields prefix="t" workflow={DEMO_WORKFLOW} board={board} draft={{ title: "", description: "", column: "todo", type, priority: 1 }} onChange={() => {}} />)
    return within(screen.getByLabelText("Parent card")).getAllByRole("option").map(option => option.textContent)
  }
  // A task or bug can sit under either level above it.
  expect(parentsFor("task")).toEqual(["No parent", "A project", "An epic"])
  expect(parentsFor("bug")).toEqual(["No parent", "A project", "An epic"])
  // An epic only under a project; a project is the top level.
  expect(parentsFor("epic")).toEqual(["No parent", "A project"])
  expect(parentsFor("project")).toEqual(["No parent"])
})

function mountHierarchy() {
  const base = DEMO_BOARD.cards[0]
  const cards = [
    { ...base, id: "p1", title: "Top project", type: "project", column: "todo", parentId: null, dependencies: [], archived: false },
    { ...base, id: "e1", title: "Middle epic", type: "epic", column: "todo", parentId: "p1", dependencies: [], archived: false },
    { ...base, id: "t1", title: "Leaf task", type: "task", column: "todo", parentId: "e1", dependencies: [], archived: false },
  ]
  let raw = JSON.stringify({ version: 1, cards })
  const store = new BoardStore({ read: () => raw, write: value => { raw = value }, subscribe: () => () => {} })
  return { ...render(<Board workspace store={store} workflow={DEMO_WORKFLOW} />), store }
}
// Projects are opened from the Projects view; their cards are not on the kanban.
const openProject = (title: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Projects" }))
  fireEvent.click(within(screen.getByLabelText("Project cards")).getByRole("button", { name: title }))
}
const archivedIds = (store: BoardStore) => store.getSnapshot().board.cards.filter(card => card.archived).map(card => card.id).sort()

it("names archive after the card type and counts linked cards at any depth", () => {
  mountHierarchy()
  openProject("Top project")
  fireEvent.click(screen.getByRole("button", { name: "Archive project" }))
  // The task sits under the epic, not the project, and still counts.
  expect(screen.getByText(/2 linked cards/)).toBeVisible()
  cleanup()

  mountHierarchy()
  fireEvent.click(screen.getByRole("button", { name: "Board" }))
  fireEvent.click(screen.getByRole("article", { name: "Leaf task" }))
  expect(screen.getByRole("button", { name: "Archive task" })).toBeVisible()
})

it("archives a card alone or with everything under it", async () => {
  const { store } = mountHierarchy()
  fireEvent.click(screen.getByRole("article", { name: "Middle epic" }))
  fireEvent.click(screen.getByRole("button", { name: "Archive epic" }))
  fireEvent.click(screen.getByRole("button", { name: "Archive only this epic" }))
  await waitFor(() => expect(archivedIds(store)).toEqual(["e1"]))
  cleanup()

  const second = mountHierarchy()
  openProject("Top project")
  fireEvent.click(screen.getByRole("button", { name: "Archive project" }))
  fireEvent.click(screen.getByRole("button", { name: "Archive all 3" }))
  await waitFor(() => expect(archivedIds(second.store)).toEqual(["e1", "p1", "t1"]))
})

it("archives a card with no linked work without asking", async () => {
  const { store } = mountHierarchy()
  fireEvent.click(screen.getByRole("article", { name: "Leaf task" }))
  fireEvent.click(screen.getByRole("button", { name: "Archive task" }))
  await waitFor(() => expect(archivedIds(store)).toEqual(["t1"]))
})
it("puts each section at its own URL when the page has one", () => {
  mountProjects({ page: "projects", pageHref: page => `/${page}` })
  const tabs = within(screen.getByRole("group", { name: "Workspace sections" }))
  expect(tabs.getByRole("link", { name: "Board" })).toHaveAttribute("href", "/board")
  expect(tabs.getByRole("link", { name: "List" })).toHaveAttribute("href", "/list")
  expect(tabs.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar")
  expect(tabs.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page")
  expect(screen.getByLabelText("Project cards")).toBeVisible()
  // The dependency graph still opens in place from the board menu.
  fireEvent.click(screen.getByRole("button", { name: "Board actions" }))
  fireEvent.click(screen.getByRole("button", { name: "Dependency graph" }))
  expect(screen.queryByLabelText("Project cards")).not.toBeInTheDocument()
})
it("keeps project cards off the kanban, where each card names its project instead", () => {
  mountProjects({ stay: true, projectHref: slug => `/project/${slug}` })
  expect(screen.queryByRole("article", { name: "Agent-ready workspace" })).not.toBeInTheDocument()
  expect(screen.queryByRole("article", { name: "Agora launch" })).not.toBeInTheDocument()
  // The project's epics and tasks stay, standing on their own in their columns.
  const ship = screen.getByRole("article", { name: "Ship the dashboard" })
  expect(within(ship).getByRole("link", { name: "Agent-ready workspace" })).toHaveAttribute("href", "/project/agent-ready-workspace")
  expect(screen.getByRole("button", { name: /^Todo\s*4$/ })).toBeVisible()
  // Project is not a type to filter by.
  fireEvent.click(screen.getByRole("button", { name: "All types" }))
  expect(screen.getAllByRole("checkbox").map(box => box.parentElement?.textContent)).toEqual(["Task", "Bug", "Epic"])
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
  // Work outside any project carries no chip.
  expect(within(screen.getByRole("article", { name: "Review the empty states" })).queryByRole("link")).not.toBeInTheDocument()
  cleanup()
  // On a project's own page every card shares the project, so chips step aside.
  mountProjects({ scopeSlug: "agent-ready-workspace", projectHref: slug => `/project/${slug}` })
  expect(within(screen.getByRole("article", { name: "Ship the dashboard" })).queryByRole("link", { name: "Agent-ready workspace" })).not.toBeInTheDocument()
})
const savedView = () => JSON.parse(window.localStorage.getItem("agora.test-dashboard.view.v2")!)
it("lists every project card on its own page, earliest target first", () => {
  mountProjects({ columns: ["todo", "doing", "review", "done"], stay: true })
  fireEvent.click(screen.getByRole("button", { name: "List" }))
  const list = within(screen.getByLabelText("Project list"))
  // No period filter here: finished and open work are listed together.
  expect(list.queryByRole("group", { name: "Project period" })).not.toBeInTheDocument()
  const table = within(list.getByRole("table"))
  const cells = (column: number) => table.getAllByRole("row").slice(1).map(row => row.querySelectorAll("td")[column].textContent)
  // A month-only target comes after that month's days; undated work comes last.
  expect(cells(3)).toEqual(["Sep 30, 2026", "Oct 16, 2026", "Oct 20, 2026", "Oct 23, 2026", "December 2026 · day TBD", "Not set", "Not set"])
  expect(cells(1).slice(0, 2)).toEqual(["Epic", "Task"])
  fireEvent.change(list.getByRole("textbox", { name: "Search project cards" }), { target: { value: "adapter" } })
  expect(cells(0)).toHaveLength(1)
})
it("keeps projects in their hand-sorted order and offers a grip to change it", () => {
  const headings = () => within(screen.getByLabelText("Project cards")).getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)
  const { projects } = mountProjects()
  // By default, the project with the earliest target leads.
  expect(headings()).toEqual(["Agent-ready workspace", "Agora launch", "Not in a project"])
  expect(projects.getByRole("button", { name: "Reorder Agora launch" })).toBeVisible()
  expect(projects.queryByRole("button", { name: "Reorder Not in a project" })).not.toBeInTheDocument()
  cleanup()
  mountProjects({ preferences: { projectOrder: ["p2", "p"] } })
  expect(headings()).toEqual(["Agora launch", "Agent-ready workspace", "Not in a project"])
})
it("resizes the project column from the keyboard and remembers the width", () => {
  const { projects } = mountProjects()
  const handle = projects.getByRole("separator", { name: "Resize the project column" })
  expect(handle).toHaveAttribute("aria-valuenow", "460")
  fireEvent.keyDown(handle, { key: "ArrowRight" })
  expect(handle).toHaveAttribute("aria-valuenow", "476")
  expect(savedView().projectColumnWidth).toBe(476)
  // It stops at its limits, and a double-click goes back to the default.
  for (let step = 0; step < 30; step++) fireEvent.keyDown(handle, { key: "ArrowLeft" })
  expect(handle).toHaveAttribute("aria-valuenow", "280")
  fireEvent.doubleClick(handle)
  expect(handle).toHaveAttribute("aria-valuenow", "460")
})
it("says a column is empty inside the column's own box", async () => {
  mountProjects({ stay: true })
  const review = screen.getByRole("region", { name: "Review column" })
  fireEvent.click(within(review).getByRole("article", { name: "Review the empty states" }))
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive task" }))
  const empty = await within(review).findByText("No cards yet. Add one or drop it here.")
  expect(empty.parentElement).toHaveClass("agora-cards")
})
it("reassigns a card from its avatar, including to nobody and back", async () => {
  const { store } = mountProjects({ stay: true })
  const ship = within(screen.getByRole("article", { name: "Ship the dashboard" }))
  fireEvent.click(ship.getByRole("button", { name: "Ship the dashboard is assigned to Codex; change assignee" }))
  fireEvent.click(screen.getByRole("button", { name: "Claude" }))
  await waitFor(() => expect(card(store, "e-ship")?.assignee).toBe("claude"))
  fireEvent.click(ship.getByRole("button", { name: "Ship the dashboard is assigned to Claude; change assignee" }))
  fireEvent.click(screen.getByRole("button", { name: "Unassigned" }))
  await waitFor(() => expect(card(store, "e-ship")?.assignee).toBeNull())
  // Unassigned cards keep a way to assign.
  expect(ship.getByRole("button", { name: "Ship the dashboard is assigned to nobody; change assignee" })).toBeInTheDocument()
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})
it("adds a card from inside a column's own box", async () => {
  const { store } = mountProjects({ stay: true })
  const todo = screen.getByRole("region", { name: "Todo column" })
  const add = within(todo).getByRole("button", { name: "Add card at the end of Todo" })
  expect(add).toHaveTextContent("Add card")
  expect(add.closest(".agora-cards")).not.toBeNull()
  fireEvent.click(add)
  const input = within(todo).getByRole("textbox", { name: "Add card at the end of Todo" })
  fireEvent.change(input, { target: { value: "Quick one" } })
  fireEvent.keyDown(input, { key: "Enter" })
  await waitFor(() => expect(store.getSnapshot().board.cards.find(item => item.title === "Quick one")).toMatchObject({ column: "todo", type: "task" }))
})
it("keeps work under its project when the type filter hides the cards in between", () => {
  const { projects } = mountProjects({ preferences: { types: ["task", "bug"] } })
  // Epics are filtered out, yet their tasks still belong to the project.
  expect(projects.getByRole("button", { name: "Agent-ready workspace" })).toBeVisible()
  expect(projects.queryByText("Ship the dashboard")).not.toBeInTheDocument()
  const group = within(projects.getByRole("button", { name: "Agent-ready workspace" }).closest("section")!)
  expect(group.getByText("Build the test dashboard")).toBeVisible()
  expect(group.getByText("Document the review workflow")).toBeVisible()
  // Only work that really has no project sits under "Not in a project".
  const loose = within(projects.getByText("Not in a project").closest("section")!)
  expect(loose.getByText("Review the empty states")).toBeVisible()
  expect(loose.queryByText("Build the test dashboard")).not.toBeInTheDocument()
})
it("shows 1, 3, 6 or 12 months on the timeline and pages through time", () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"))
  const { projects } = mountProjects()
  const months = () => Array.from(document.querySelectorAll(".agora-timeline-months > span")).map(month => month.textContent)
  const marks = (selector: string) => document.querySelectorAll(`.agora-timeline-row[data-depth] ${selector}`).length
  // Six months from this month by default; Today has nowhere to go yet.
  expect(months()).toEqual(["Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027", "Mar 2027"])
  expect(projects.getByRole("button", { name: "Today" })).toBeDisabled()
  // Ship the dashboard is due Oct 23; the workspace epic only has December.
  expect(marks(".agora-timeline-point")).toBeGreaterThan(0)
  expect(marks(".agora-timeline-month")).toBe(1)

  fireEvent.click(projects.getByRole("button", { name: "3 months" }))
  expect(months()).toEqual(["Oct 2026", "Nov 2026", "Dec 2026"])
  expect(savedView().timelineSpan).toBe(3)
  fireEvent.click(projects.getByRole("button", { name: "Later months" }))
  expect(months()).toEqual(["Nov 2026", "Dec 2026", "Jan 2027"])
  fireEvent.click(projects.getByRole("button", { name: "Today" }))
  expect(months()).toEqual(["Oct 2026", "Nov 2026", "Dec 2026"])

  // One month names itself in full, marks each week, and drops what falls outside it.
  fireEvent.click(projects.getByRole("button", { name: "1 month" }))
  expect(months()).toEqual(["October 2026"])
  expect(Array.from(document.querySelectorAll(".agora-timeline-months em")).map(mark => mark.textContent)).toEqual(["8", "15", "22", "29"])
  expect(marks(".agora-timeline-month")).toBe(0)
  fireEvent.click(projects.getByRole("button", { name: "Later months" }))
  expect(months()).toEqual(["November 2026"])
  expect(marks(".agora-timeline-point")).toBe(0)

  fireEvent.click(projects.getByRole("button", { name: "12 months" }))
  expect(months()).toHaveLength(12)
  expect(months().at(-1)).toBe("Oct 2027")
})
it("shows the card behind a timeline marker on hover and goes to it on the board on click", () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"))
  const { projects } = mountProjects()
  const row = projects.getByRole("button", { name: "Agent-ready workspace" }).closest(".agora-timeline-project")!
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  // The project's own row carries a dot for the sub-project due Oct 23…
  const dot = row.querySelector<HTMLElement>(".agora-timeline-point")!
  fireEvent.mouseOver(dot)
  const hover = within(screen.getByRole("tooltip"))
  expect(hover.getByText("Ship the dashboard")).toBeVisible()
  expect(hover.getByText("Epic")).toBeVisible()
  expect(hover.getByText("Todo")).toBeVisible()
  expect(hover.getByText("Oct 23, 2026")).toBeVisible()
  expect(hover.getByText("Click to show it on the board")).toBeVisible()
  // …and a dashed span for the one that only has a month.
  fireEvent.mouseOver(row.querySelector(".agora-timeline-month")!)
  expect(within(screen.getByRole("tooltip")).getByText("A workspace for humans and agents")).toBeVisible()
  expect(within(screen.getByRole("tooltip")).getByText("December 2026 · day TBD")).toBeVisible()
  // Moving off the markers puts it away.
  fireEvent.mouseOver(row.querySelector(".agora-timeline-label")!)
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  // Clicking the dot switches to the board with that card selected.
  fireEvent.click(dot)
  expect(screen.getByRole("article", { name: "Ship the dashboard" })).toHaveAttribute("data-selected", "true")
  expect(screen.queryByLabelText("Project cards")).not.toBeInTheDocument()
})
it("links a marker to its card on the board when pages have URLs", () => {
  mountProjects({ page: "projects", pageHref: page => `/${page}`, columns: ["todo", "doing", "review", "done"] })
  // The epic has a marker on the project's row and one on its own row.
  const markers = screen.getAllByRole("link", { name: "Ship the dashboard: show on the board" })
  expect(markers).toHaveLength(2)
  for (const marker of markers) expect(marker).toHaveAttribute("href", "/board?card=e-ship")
})
it("selects and reveals the card named in the URL, whatever the filters hide", async () => {
  // A backlog task (Backlog is off) …
  window.history.pushState(null, "", "/board?card=t-later&keep=1")
  mountProjects({ stay: true })
  const later = await screen.findByRole("article", { name: "Explore weekly planning" })
  expect(later).toHaveAttribute("data-selected", "true")
  expect(screen.getByRole("region", { name: "Backlog column" })).toBeVisible()
  // … without changing the saved column choice, and the URL is tidied up.
  expect(screen.getByRole("button", { name: /^3 of 6 columns/ })).toBeVisible()
  expect(window.location.search).toBe("?keep=1")
  cleanup()
  // A subtask under a folded epic, with tasks filtered out of the type menu.
  window.history.pushState(null, "", "/board?card=t-build")
  mountProjects({ stay: true, preferences: { collapsed: ["e-ship"], types: ["epic"] } })
  expect(await screen.findByRole("article", { name: "Build the test dashboard" })).toHaveAttribute("data-selected", "true")
  window.history.pushState(null, "", "/")
})
it("reassigns projects and their rows from the Projects view", async () => {
  const { store, projects } = mountProjects()
  fireEvent.click(projects.getByRole("button", { name: "Ship the dashboard is assigned to Codex; change assignee" }))
  fireEvent.click(screen.getByRole("button", { name: "Claude" }))
  await waitFor(() => expect(card(store, "e-ship")?.assignee).toBe("claude"))
  fireEvent.click(projects.getByRole("button", { name: "Agent-ready workspace is assigned to You; change assignee" }))
  fireEvent.click(screen.getByRole("button", { name: "Codex" }))
  await waitFor(() => expect(card(store, "p")?.assignee).toBe("codex"))
})
it("offers open projects and their epics as a scope, as a hierarchy", async () => {
  mountProjects({ stay: true })
  fireEvent.click(screen.getByRole("button", { name: "Scope" }))
  const menu = within(screen.getByRole("dialog", { name: "Scope" }))
  const entries = menu.getAllByRole("button").map(button => [button.textContent, button.style.paddingLeft])
  // Epics sit indented under their project; a finished epic (Public demo site) is left out.
  expect(entries).toEqual([
    ["All work", "8px"],
    ["Agent-ready workspace", "8px"],
    ["Ship the dashboard", "26px"],
    ["A workspace for humans and agents", "26px"],
    ["Agora launch", "8px"],
    ["Codex adapter", "8px"],
  ])
  // Picking an epic scopes the board to it, with its header on top.
  fireEvent.click(menu.getByRole("button", { name: "Ship the dashboard" }))
  expect(screen.getByRole("region", { name: "Epic: Ship the dashboard" })).toBeVisible()
  expect(screen.getByRole("article", { name: "Build the test dashboard" })).toBeVisible()
  expect(screen.queryByRole("article", { name: "Document the review workflow" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Scope: Ship the dashboard" })).toBeVisible()
  fireEvent.click(within(screen.getByRole("navigation", { name: "Project" })).getByRole("button", { name: "All projects" }))
  expect(screen.getByRole("article", { name: "Document the review workflow" })).toBeVisible()
})
it("leaves archived and won't-do work out of the scope choices", () => {
  const { store } = mountProjects({ stay: true })
  store.dispatch({ type: "archive", id: "e-codex" })
  store.dispatch({ type: "edit", id: "p2", draft: { ...card(store, "p2")!, column: "wont-do" } })
  fireEvent.click(screen.getByRole("button", { name: "Scope" }))
  const names = within(screen.getByRole("dialog", { name: "Scope" })).getAllByRole("button").map(button => button.textContent)
  expect(names).not.toContain("Codex adapter")
  expect(names).not.toContain("Agora launch")
  expect(names).toContain("Agent-ready workspace")
})
it("links each scope to its own page when pages have URLs", () => {
  mountProjects({ page: "projects", pageHref: page => `/${page}`, scopeHref: slug => slug ? `/project/${slug}/projects` : "/projects" })
  fireEvent.click(screen.getByRole("button", { name: "Scope" }))
  const menu = within(screen.getByRole("dialog", { name: "Scope" }))
  expect(menu.getByRole("link", { name: "All work" })).toHaveAttribute("href", "/projects")
  expect(menu.getByRole("link", { name: "Agent-ready workspace" })).toHaveAttribute("href", "/project/agent-ready-workspace/projects")
  expect(menu.getByRole("link", { name: "Ship the dashboard" })).toHaveAttribute("href", "/project/ship-the-dashboard/projects")
})

it("the plain board's card editor reviews a card in review too", async () => {
  const card = (id: string, column: string): BoardCard => ({ id, title: id, description: "", column, archived: false, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" })
  let raw = JSON.stringify({ version: 1, cards: [card("Ready for a look", "review"), card("Still going", "doing")] })
  const store = new BoardStore({ read: () => raw, write: value => { raw = value }, subscribe: () => () => {} }, DEMO_WORKFLOW)
  render(<Board store={store} workflow={DEMO_WORKFLOW} />)
  fireEvent.click(screen.getByRole("button", { name: "Edit Ready for a look" }))
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }))
  const reviewed = () => store.getSnapshot().board.cards.find(item => item.id === "Ready for a look")!
  await waitFor(() => expect(reviewed()).toMatchObject({ column: "done", reviewStatus: "approved" }))
  expect(reviewed().comments?.[0]).toMatchObject({ body: "Approved.", author: "You" })
  fireEvent.click(screen.getByRole("button", { name: "Edit Still going" }))
  expect(within(screen.getByRole("dialog")).queryByRole("region", { name: "Review" })).not.toBeInTheDocument()
})
