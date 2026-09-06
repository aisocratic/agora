import { focusCards, sortCards } from "../lib/board-view"
import { describe, expect, it } from "vitest"
import { DEMO_BOARD, DEMO_STORAGE_KEY, DEMO_WORKFLOW } from "../lib/demo-board"
import { BOARD_STORAGE_KEY } from "../lib/board-storage"
import { parseBoard, updateBoard } from "../lib/board"
import { workflowSchema } from "../lib/workflow"

describe("test dashboard data", () => {
  it("has valid hierarchy and workflow without using the personal board key", () => {
    expect(DEMO_STORAGE_KEY).not.toBe(BOARD_STORAGE_KEY)
    expect(workflowSchema.parse(DEMO_WORKFLOW)).toEqual(DEMO_WORKFLOW)
    const board = parseBoard(JSON.stringify(DEMO_BOARD))
    expect(board.cards.some(card => card.parentId)).toBe(true)
    expect(board.cards.every(card => DEMO_WORKFLOW.columns.some(column => column.id === card.column))).toBe(true)
  })

  it("preserves priority and flags through edit, move, and export/import", () => {
    const original = DEMO_BOARD.cards[0]
    let board = updateBoard(DEMO_BOARD, { type: "edit", id: original.id, draft: { ...original, priority: 3, needsHumanReview: true } })
    board = updateBoard(board, { type: "move", id: original.id, column: "review", position: 0 })
    expect(parseBoard(JSON.stringify(board)).cards.find(card => card.id === original.id)).toMatchObject({ priority: 3, needsHumanReview: true, column: "review" })
    expect(DEMO_BOARD.cards[0].priority).toBe(1)
  })

  it("rejects invalid priority while accepting legacy cards without it", () => {
    const card = { ...DEMO_BOARD.cards[0] }
    delete card.priority
    expect(() => parseBoard(JSON.stringify({ version: 1, cards: [card] }))).not.toThrow()
    for (const priority of [0, 4, 1.5, "high"]) {
      expect(() => parseBoard(JSON.stringify({ version: 1, cards: [{ ...card, priority }] }))).toThrow()
    }
  })
})

describe("reference board ordering and Focus semantics", () => {
  it("sorts priorities without mutating stored manual order", () => {
    const before = DEMO_BOARD.cards.map(card => card.id)
    const sorted = sortCards(DEMO_BOARD.cards, "priority-desc")
    expect(sorted[0].priority).toBe(3)
    expect(sorted.at(-1)?.priority).toBe(1)
    expect(DEMO_BOARD.cards.map(card => card.id)).toEqual(before)
    expect(sortCards(DEMO_BOARD.cards, "manual")).toBe(DEMO_BOARD.cards)
  })
  it("breaks ties consistently even when the source order changes", () => {
    expect(sortCards([...DEMO_BOARD.cards].reverse(), "priority-desc")).toEqual(sortCards(DEMO_BOARD.cards, "priority-desc"))
  })
  it("keeps backlog and terminal work out of Focus, including custom column IDs", () => {
    const cards = DEMO_BOARD.cards.map(card => ({ ...card, column: card.column === "doing" ? "building" : card.column }))
    const workflow = { ...DEMO_WORKFLOW, columns: DEMO_WORKFLOW.columns.map(column => column.id === "doing" ? { ...column, id: "building" } : column) }
    const focus = focusCards(cards, workflow)
    expect(focus.inProgress).toHaveLength(4)
    expect(focus.upNext).toHaveLength(4)
    expect(focus.inProgress.every(card => ["building", "review"].includes(card.column))).toBe(true)
    expect(focus.upNext.every(card => card.column === "todo")).toBe(true)
  })
})
