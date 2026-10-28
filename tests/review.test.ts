import { describe, expect, it } from "vitest"
import { updateBoard, type BoardCard, type BoardData } from "../lib/board"
import { reviewAction } from "../lib/review"
import { actionSchema } from "../lib/server/http"
import { DEMO_WORKFLOW } from "../lib/demo-board"
import { DEFAULT_WORKFLOW } from "../lib/workflow"

const card = (id: string, column: string, extra: Partial<BoardCard> = {}): BoardCard => ({
  id, title: id, description: "", column, archived: false, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...extra,
})
const board: BoardData = { version: 1, cards: [card("pr", "review", { prUrl: "https://github.com/o/r/pull/1" }), card("plain", "review"), card("work", "doing")] }
const review = (data: BoardData, id: string, verdict: "approved" | "changes_requested", feedback?: string, workflow = DEMO_WORKFLOW) =>
  updateBoard(data, reviewAction(data, id, verdict, feedback, workflow, "Fed", "2026-10-27T12:00:00.000Z"), "2026-10-27T12:00:00.000Z", workflow)
const find = (data: BoardData, id: string) => data.cards.find(item => item.id === id)!

describe("review verdicts", () => {
  it("approves a card with a PR in place, for the merge, and records the verdict as a comment", () => {
    const next = find(review(board, "pr", "approved", "  Looks good  "), "pr")
    expect(next).toMatchObject({ column: "review", reviewStatus: "approved", reviewFeedback: "Looks good" })
    expect(next.comments).toEqual([expect.objectContaining({ body: "Approved: Looks good", author: "Fed" })])
  })

  it("finishes an approved card with nothing to merge, or leaves it where no done column exists", () => {
    expect(find(review(board, "plain", "approved"), "plain")).toMatchObject({ column: "done", reviewStatus: "approved", reviewFeedback: null })
    expect(find(review(board, "plain", "approved"), "plain").comments?.[0].body).toBe("Approved.")
    expect(find(review(board, "plain", "approved", undefined, DEFAULT_WORKFLOW), "plain").column).toBe("review")
  })

  it("sends a card back to todo with the requested changes, which are required", () => {
    expect(() => reviewAction(board, "pr", "changes_requested", "  ", DEMO_WORKFLOW, "Fed")).toThrow("Say what to change")
    const next = find(review(board, "pr", "changes_requested", "Handle the empty state"), "pr")
    expect(next).toMatchObject({ column: "todo", reviewStatus: "changes_requested", reviewFeedback: "Handle the empty state" })
    expect(next.comments?.[0].body).toBe("Changes requested: Handle the empty state")
  })

  it("reviews only cards in a review column", () => {
    expect(() => reviewAction(board, "work", "approved", "", DEMO_WORKFLOW, "Fed")).toThrow("Only a card in review")
    const archived = { ...board, cards: board.cards.map(item => item.id === "pr" ? { ...item, archived: true } : item) }
    expect(() => reviewAction(archived, "pr", "approved", "", DEMO_WORKFLOW, "Fed")).toThrow("Only a card in review")
    expect(() => reviewAction(board, "missing", "approved", "", DEMO_WORKFLOW, "Fed")).toThrow()
  })

  it("needs a fresh verdict when the card enters review again, keeping the feedback", () => {
    let next = review(board, "pr", "changes_requested", "Handle the empty state")
    next = updateBoard(next, { type: "move", id: "pr", column: "doing", position: 0 }, undefined, DEMO_WORKFLOW)
    expect(find(next, "pr").reviewStatus).toBe("changes_requested")
    next = updateBoard(next, { type: "move", id: "pr", column: "review", position: 0 }, undefined, DEMO_WORKFLOW)
    expect(find(next, "pr")).toMatchObject({ reviewStatus: null, reviewFeedback: "Handle the empty state" })
    // An edit into review clears it too; staying in review does not.
    let edited = review(board, "pr", "approved")
    edited = updateBoard(edited, { type: "edit", id: "pr", draft: { title: "Renamed", description: "", column: "review" } }, undefined, DEMO_WORKFLOW)
    expect(find(edited, "pr").reviewStatus).toBe("approved")
  })

  it("is never set through a draft", () => {
    const edited = updateBoard(review(board, "pr", "approved"), { type: "edit", id: "pr", draft: { title: "pr", description: "", column: "review", reviewStatus: null } as never })
    expect(find(edited, "pr").reviewStatus).toBe("approved")
    expect(actionSchema.safeParse({ type: "edit", id: "pr", draft: { title: "pr", description: "", column: "review", reviewStatus: "approved" } }).success).toBe(false)
  })
})
