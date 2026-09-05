import { describe, expect, it } from "vitest"
import { EMPTY_BOARD, parseBoard, updateBoard, type BoardData } from "../lib/board"
import { BoardStore, type BoardStorage } from "../lib/board-storage"

const draft = (title: string) => ({
  title,
  description: "Context\nNext step",
  column: "backlog" as const,
})
const create = (board: BoardData, id: string) =>
  updateBoard(board, { type: "create", id, draft: draft(id) }, "2026-09-05T00:00:00Z")
function memory(initial: string | null = null) {
  let value = initial
  let failWrite = false
  const listeners = new Set<() => void>()
  const adapter: BoardStorage = {
    read: () => value,
    write: (next) => {
      if (failWrite) throw new Error("Quota")
      value = next
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return {
    adapter,
    read: () => value,
    fail: () => {
      failWrite = true
    },
    external: (next: string) => {
      value = next
      listeners.forEach((listener) => listener())
    },
  }
}

describe("card lifecycle", () => {
  it("creates, edits, moves, reorders, archives, restores and deletes without changing other cards", () => {
    let board = create(create(create(EMPTY_BOARD, "a"), "b"), "c")
    board = updateBoard(board, {
      type: "edit",
      id: "a",
      draft: { ...draft(" Updated "), description: "Preserve\nthese details" },
    })
    board = updateBoard(board, { type: "move", id: "c", column: "backlog", position: 0 })
    expect(board.cards.map((card) => card.id)).toEqual(["c", "a", "b"])
    board = updateBoard(board, { type: "move", id: "a", column: "review", position: 0 })
    expect(board.cards.find((card) => card.id === "a")).toMatchObject({
      title: "Updated",
      description: "Preserve\nthese details",
      column: "review",
    })
    expect(() => updateBoard(board, { type: "delete", id: "a" })).toThrow("Archive")
    board = updateBoard(board, { type: "archive", id: "a" })
    board = updateBoard(board, { type: "restore", id: "a" })
    expect(board.cards.find((card) => card.id === "a")?.archived).toBe(false)
    board = updateBoard(updateBoard(board, { type: "archive", id: "a" }), {
      type: "delete",
      id: "a",
    })
    expect(board.cards.map((card) => card.id)).toEqual(["c", "b"])
    expect(parseBoard(JSON.stringify(board))).toEqual(board)
  })
  it("rejects blank titles, duplicate ids and unsupported saved data", () => {
    expect(() =>
      updateBoard(EMPTY_BOARD, { type: "create", id: "a", draft: draft(" \n ") }),
    ).toThrow("title")
    const board = create(EMPTY_BOARD, "a")
    expect(() => create(board, "a")).toThrow("already exists")
    expect(() => parseBoard('{"version":2,"cards":[]}')).toThrow()
    expect(() =>
      parseBoard(JSON.stringify({ version: 1, cards: [board.cards[0], board.cards[0]] })),
    ).toThrow()
    expect(() => updateBoard(board, { type: "edit", id: "gone", draft: draft("a") })).toThrow(
      "removed",
    )
  })
})

describe("browser persistence", () => {
  it("persists exact order, details and archive state across fresh stores", () => {
    const storage = memory()
    const store = new BoardStore(storage.adapter)
    store.connect()
    store.dispatch({ type: "create", id: "a", draft: draft("A") })
    store.dispatch({ type: "create", id: "b", draft: draft("B") })
    store.dispatch({ type: "move", id: "b", column: "backlog", position: 0 })
    store.dispatch({ type: "archive", id: "a" })
    const reloaded = new BoardStore(storage.adapter)
    reloaded.connect()
    expect(reloaded.getSnapshot().board).toEqual(store.getSnapshot().board)
    expect(reloaded.getSnapshot().board.cards.map((card) => card.id)).toEqual(["b", "a"])
  })
  it("keeps a deliberately empty board empty on reload", () => {
    const storage = memory(JSON.stringify(EMPTY_BOARD))
    const store = new BoardStore(storage.adapter)
    store.connect()
    expect(store.getSnapshot().board.cards).toEqual([])
  })
  it("reads the latest state before writes and follows storage events from another tab", () => {
    const storage = memory()
    const first = new BoardStore(storage.adapter)
    first.connect()
    const second = new BoardStore(storage.adapter)
    second.connect()
    first.dispatch({ type: "create", id: "first", draft: draft("First") })
    second.dispatch({ type: "create", id: "second", draft: draft("Second") })
    expect(second.getSnapshot().board.cards).toHaveLength(2)
    storage.external(storage.read()!)
    expect(first.getSnapshot().board).toEqual(second.getSnapshot().board)
  })
  it("preserves corrupt data untouched and exports the original bytes", () => {
    const storage = memory("{broken data")
    const store = new BoardStore(storage.adapter)
    store.connect()
    expect(store.getSnapshot().readOnly).toBe(true)
    expect(() => store.dispatch({ type: "create", id: "a", draft: draft("A") })).toThrow()
    expect(store.export()).toBe("{broken data")
    expect(storage.read()).toBe("{broken data")
  })
  it("keeps every in-tab edit when persistence fails, and does not overwrite it with an old storage event", () => {
    const storage = memory()
    const store = new BoardStore(storage.adapter)
    store.connect()
    storage.fail()
    store.dispatch({ type: "create", id: "a", draft: draft("A") })
    store.dispatch({ type: "edit", id: "a", draft: draft("Updated") })
    store.dispatch({ type: "create", id: "b", draft: draft("B") })
    storage.external(JSON.stringify(EMPTY_BOARD))
    expect(store.getSnapshot().unsaved).toBe(true)
    expect(parseBoard(store.export()).cards.map((card) => card.title)).toEqual(["Updated", "B"])
  })
  it("retains an edit if storage reads begin failing after connection", () => {
    const storage = memory()
    let failRead = false
    const store = new BoardStore({
      ...storage.adapter,
      read: () => {
        if (failRead) throw new Error("Denied")
        return storage.read()
      },
    })
    store.connect()
    store.dispatch({ type: "create", id: "a", draft: draft("Original") })
    failRead = true
    store.dispatch({ type: "edit", id: "a", draft: draft("Keep this edit") })
    expect(store.getSnapshot().unsaved).toBe(true)
    expect(store.getSnapshot().board.cards[0].title).toBe("Keep this edit")
    expect(parseBoard(storage.read()!).cards[0].title).toBe("Original")
  })
  it("protects saved data that becomes corrupt before a mutation", () => {
    let raw: string | null = null
    const store = new BoardStore({
      read: () => raw,
      write: (value) => {
        raw = value
      },
      subscribe: () => () => {},
    })
    store.connect()
    store.dispatch({ type: "create", id: "a", draft: draft("Original") })
    raw = "broken"
    expect(() => store.dispatch({ type: "edit", id: "a", draft: draft("Edit") })).toThrow(
      "untouched",
    )
    expect(raw).toBe("broken")
    expect(store.getSnapshot().readOnly).toBe(true)
  })
  it("rejects an invalid import without losing the existing board", () => {
    const storage = memory()
    const store = new BoardStore(storage.adapter)
    store.connect()
    store.dispatch({ type: "create", id: "a", draft: draft("A") })
    expect(() => store.replace('{"version":5,"cards":[]}')).toThrow()
    expect(store.getSnapshot().board.cards[0].title).toBe("A")
  })
})
