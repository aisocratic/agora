import { describe, expect, it } from "vitest"
import type { BoardCard } from "../lib/board"
import { leafDescendants, subtaskProgress, subtreeProgress } from "../lib/subtasks"
import { DEMO_WORKFLOW } from "../lib/demo-board"

const card = (id: string, column: string, parentId: string | null = null, archived = false): BoardCard => ({
  id, title: id, description: "", column, archived, parentId, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
})

describe("subtree completion", () => {
  // epic › (task a › subtasks a1 a2 a3) and task b; a1 and b are done.
  const cards = [
    card("epic", "todo"), card("a", "doing", "epic"), card("b", "done", "epic"),
    card("a1", "done", "a"), card("a2", "todo", "a"), card("a3", "review", "a"),
  ]
  const childrenOf = (id: string) => cards.filter(item => item.parentId === id)

  it("counts the leaves at the bottom of the tree, not the direct children", () => {
    expect(leafDescendants("epic", childrenOf).map(item => item.id)).toEqual(["a1", "a2", "a3", "b"])
    expect(subtreeProgress(cards, DEMO_WORKFLOW)("epic")).toEqual({ total: 4, done: 2, percent: 50 })
    expect(subtreeProgress(cards, DEMO_WORKFLOW)("a")).toEqual({ total: 3, done: 1, percent: 33 })
  })

  it("leaves archived and won't-do work out of the count", () => {
    const dropped = [...cards, card("a4", "wont-do", "a"), card("a5", "done", "a", true)]
    expect(subtreeProgress(dropped, DEMO_WORKFLOW)("a")).toEqual({ total: 3, done: 1, percent: 33 })
    expect(subtaskProgress([card("x", "wont-do"), card("y", "todo", null, true)], DEMO_WORKFLOW)).toBeNull()
  })

  it("has nothing to show for a card without children", () => {
    expect(subtreeProgress(cards, DEMO_WORKFLOW)("b")).toBeNull()
  })

  it("never loops on a malformed parent cycle", () => {
    const loop = [card("x", "todo", "y"), card("y", "done", "x")]
    expect(leafDescendants("x", id => loop.filter(item => item.parentId === id))).toEqual([])
  })
})
