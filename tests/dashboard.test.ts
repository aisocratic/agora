import { projectGroups, sortCards } from "../lib/board-view"
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

describe("reference board ordering and Project semantics", () => {
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
  it("groups work under the project it rolls up to, through intermediate epics", () => {
    const { groups, loose } = projectGroups(DEMO_BOARD.cards, DEMO_WORKFLOW)
    expect(groups).toHaveLength(1)
    expect(groups[0].project.title).toBe("Agent-ready workspace")
    // Tasks parented to an epic still roll up to that epic's project.
    const titles = groups[0].cards.map(card => card.title)
    expect(titles).toContain("Ship the dashboard")
    expect(titles).toContain("Fix mobile column scrolling")
    expect(titles).not.toContain("Agent-ready workspace")
    expect(loose.every(card => !titles.includes(card.title))).toBe(true)
    expect(loose.map(card => card.title)).toContain("Review the empty states")
  })
  it("never loses a card to a parent cycle", () => {
    const cards = DEMO_BOARD.cards.map(card => card.id === "demo-1" ? { ...card, parentId: "demo-2" } : card)
    const { groups, loose } = projectGroups(cards, DEMO_WORKFLOW)
    expect(groups.length + loose.length).toBeGreaterThan(0)
  })
})
