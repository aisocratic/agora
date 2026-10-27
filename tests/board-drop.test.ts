import { describe, expect, it } from "vitest"
import { updateBoard, type BoardCard, type BoardData } from "../lib/board"
import { dragGroupOf, groupMoveActions } from "../lib/board-drop"
import { boxesOverlap, edgeScrollSpeed } from "../components/board/use-marquee-select"

const card = (id: string, column: string, archived = false): BoardCard => ({
  id, title: id, description: "", column, archived, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
})
const board: BoardData = { version: 1, cards: [card("t1", "todo"), card("t2", "todo"), card("t3", "todo"), card("r1", "review"), card("r2", "review"), card("gone", "todo", true)] }
const apply = (data: BoardData, ids: string[], column: string, before: string | null) => groupMoveActions(data, ids, column, before).reduce((next, action) => updateBoard(next, action), data)
const column = (data: BoardData, id: string) => data.cards.filter(item => item.column === id && !item.archived).map(item => item.id)

describe("moving a selection together", () => {
  it("carries the whole selection only when the dragged card is part of it", () => {
    expect(dragGroupOf(board.cards, "t3", new Set(["t3", "t1", "gone"])).map(item => item.id)).toEqual(["t1", "t3"])
    expect(dragGroupOf(board.cards, "t2", new Set(["t3", "t1"])).map(item => item.id)).toEqual(["t2"])
    expect(dragGroupOf(board.cards, "t2", new Set(["t2"])).map(item => item.id)).toEqual(["t2"])
  })

  it("lands the group together, in board order, before the card it was dropped on", () => {
    const next = apply(board, ["t3", "t1"], "review", "r2")
    expect(column(next, "review")).toEqual(["r1", "t1", "t3", "r2"])
    expect(column(next, "todo")).toEqual(["t2"])
  })

  it("goes to the column's end when dropped on the column or on its own cards", () => {
    expect(column(apply(board, ["t1", "r1"], "review", null), "review")).toEqual(["r2", "t1", "r1"])
    expect(column(apply(board, ["t1", "r1"], "review", "r1"), "review")).toEqual(["r2", "t1", "r1"])
  })

  it("reorders within a column and writes nothing when nothing would change", () => {
    expect(column(apply(board, ["t2", "t3"], "todo", "t1"), "todo")).toEqual(["t2", "t3", "t1"])
    expect(groupMoveActions(board, ["t1", "t2"], "todo", "t2")).toEqual([])
    expect(groupMoveActions(board, ["t2", "t3"], "todo", null)).toEqual([])
    expect(groupMoveActions(board, ["gone"], "review", null)).toEqual([])
  })
})

describe("marquee selection", () => {
  it("scrolls up near the top edge, down near the bottom, faster closer in, and not in between", () => {
    expect(edgeScrollSpeed(400, 0, 800)).toBe(0)
    expect(edgeScrollSpeed(10, 0, 800)).toBeLessThan(0)
    expect(edgeScrollSpeed(790, 0, 800)).toBeGreaterThan(0)
    expect(Math.abs(edgeScrollSpeed(0, 0, 800))).toBeGreaterThan(Math.abs(edgeScrollSpeed(50, 0, 800)))
    expect(edgeScrollSpeed(900, 0, 800)).toBe(edgeScrollSpeed(800, 0, 800))
  })

  it("tells overlapping boxes from apart ones", () => {
    expect(boxesOverlap({ left: 0, top: 0, width: 10, height: 10 }, { left: 5, top: 5, width: 10, height: 10 })).toBe(true)
    expect(boxesOverlap({ left: 0, top: 0, width: 10, height: 10 }, { left: 20, top: 0, width: 10, height: 10 })).toBe(false)
  })
})
