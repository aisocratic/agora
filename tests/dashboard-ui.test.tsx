// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Board } from "../components/board/board"
import { BoardStore } from "../lib/board-storage"
import { DEMO_BOARD, DEMO_WORKFLOW } from "../lib/demo-board"
import { TaskFields } from "../components/board/task-fields"
import type { BoardData } from "../lib/board"

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
afterEach(cleanup)
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
it("Projects lists each project with the work that rolls up to it", () => {
  mountBoard()
  fireEvent.click(screen.getByRole("button", { name: "Projects" }))
  const projects = within(screen.getByLabelText("Project cards"))
  expect(projects.getByRole("button", { name: "Agent-ready workspace" })).toBeVisible()
  expect(projects.getByText("Build the test dashboard")).toBeVisible()
  expect(projects.getByText("Not in a project")).toBeVisible()
  expect(JSON.parse(window.localStorage.getItem("agora.test-dashboard.view.v2")!).view).toBe("project")
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
const archivedIds = (store: BoardStore) => store.getSnapshot().board.cards.filter(card => card.archived).map(card => card.id).sort()

it("names archive after the card type and counts linked cards at any depth", () => {
  mountHierarchy()
  fireEvent.click(screen.getByRole("article", { name: "Top project" }))
  fireEvent.click(screen.getByRole("button", { name: "Archive project" }))
  // The task sits under the epic, not the project, and still counts.
  expect(screen.getByText(/2 linked cards/)).toBeVisible()
  cleanup()

  mountHierarchy()
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
  fireEvent.click(screen.getByRole("article", { name: "Top project" }))
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
