import { describe, expect, it } from "vitest"
import { EMPTY_BOARD, updateBoard } from "../lib/board"
import { goalProgressPercent, goalProgressSchema } from "../lib/goal-progress"
import { actionSchema } from "../lib/server/http"

describe("measured card progress", () => {
  it("derives progress from results, including zero and a completed goal", () => {
    expect(goalProgressPercent({ label: "Accounts found", current: 0, total: 100 })).toBe(0)
    expect(goalProgressPercent({ label: "Accounts found", current: 32, total: 100 })).toBe(32)
    expect(goalProgressPercent({ label: "Accounts found", current: 100, total: 100 })).toBe(100)
  })
  it.each([
    { label: "Accounts", current: 1, total: 0 },
    { label: "Accounts", current: -1, total: 100 },
    { label: "Accounts", current: 101, total: 100 },
    { label: "Accounts", current: 1.5, total: 100 },
    { label: "Accounts", current: 1, total: Infinity },
    { label: " ", current: 1, total: 100 },
    { label: "x".repeat(81), current: 1, total: 100 },
    { label: "Accounts", current: 1, total: 100, unit: "people" },
    { label: "Accounts", total: 100 },
  ])("rejects invalid or unmeasurable counts: %j", (value) => {
    expect(goalProgressSchema.safeParse(value).success).toBe(false)
  })
  it("is accepted by the API's create and edit drafts, which reject anything else", () => {
    const draft = { title: "Find guests", description: "", column: "todo", progress: { label: "Accounts found", current: 32, total: 100 } }
    expect(actionSchema.safeParse({ type: "create", id: "c", draft }).success).toBe(true)
    expect(actionSchema.safeParse({ type: "edit", id: "c", draft: { ...draft, progress: null } }).success).toBe(true)
    expect(actionSchema.safeParse({ type: "edit", id: "c", draft: { ...draft, progress: { label: "Accounts", current: 5, total: 2 } } }).success).toBe(false)
  })
  it("keeps the goal through an edit that omits it, clears it with null, and trims the label", () => {
    const progress = { label: "  Accounts found ", current: 32, total: 100 }
    let board = updateBoard(EMPTY_BOARD, { type: "create", id: "c", draft: { title: "Find guests", description: "", column: "todo", progress } })
    expect(board.cards[0].progress).toEqual({ label: "Accounts found", current: 32, total: 100 })
    board = updateBoard(board, { type: "edit", id: "c", draft: { title: "Find more guests", description: "", column: "doing" } })
    expect(board.cards[0].progress).toEqual({ label: "Accounts found", current: 32, total: 100 })
    board = updateBoard(board, { type: "edit", id: "c", draft: { title: "Find more guests", description: "", column: "doing", progress: null } })
    expect(board.cards[0].progress).toBeNull()
  })
})
