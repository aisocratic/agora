// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Board } from "../components/board/board"
import { BoardStore } from "../lib/board-storage"
import { DEMO_BOARD, DEMO_WORKFLOW } from "../lib/demo-board"

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
function mountBoard() {
  const data = { version: 1, cards: [
    ...Array.from({ length: 8 }, (_, index) => ({ ...DEMO_BOARD.cards[1], id: `queued-${index}`, title: `Queued task ${index}`, column: "todo", priority: 1, parentId: null })),
    DEMO_BOARD.cards[7], DEMO_BOARD.cards[9], DEMO_BOARD.cards[0], DEMO_BOARD.cards[11],
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
it("Focus shows active work and excludes backlog and completed cards", () => {
  mountBoard()
  fireEvent.click(screen.getByRole("button", { name: "Focus" }))
  const focus = within(screen.getByLabelText("Focus cards"))
  expect(focus.getByText("Up Next")).toBeVisible()
  expect(focus.getByText("Build the test dashboard")).toBeVisible()
  expect(focus.queryByText("A workspace for humans and agents")).not.toBeInTheDocument()
  expect(focus.queryByText("Set up the shared design tokens")).not.toBeInTheDocument()
  expect(JSON.parse(window.localStorage.getItem("agora.test-dashboard.view.v2")!).view).toBe("focus")
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
