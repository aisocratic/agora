import { BoardValidationError, type BoardAction, type BoardData } from "./board"
import type { Workflow } from "./workflow"

/* A person's verdict on a card in review, as on the AI Socratic website's board
   (review_status / review_feedback there, reviewStatus / reviewFeedback here):
     approved           with a PR, the card stays in review for the merge; with
                        nothing to merge it moves to the first done column
     changes_requested  back to the first todo column (the agent queue), to be
                        reworked using the feedback
   Each verdict is also posted as a comment by the reviewer, so the card's
   comment log keeps the history. Entering a review column again clears the
   verdict (a fresh review is needed) and keeps the feedback for context.
   Verdicts do not change planning: the planner never reads them. */
export const REVIEW_STATUSES = ["approved", "changes_requested"] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

const roleOf = (workflow: Workflow, column: string) => workflow.columns.find(item => item.id === column)?.role

/* The review action for a verdict, checked against the board and workflow. */
export function reviewAction(board: BoardData, id: string, verdict: ReviewStatus, feedback: string | null | undefined, workflow: Workflow, author: string, now = new Date().toISOString()): Extract<BoardAction, { type: "review" }> {
  const card = board.cards.find(item => item.id === id)
  if (!card) throw new BoardValidationError("This card was removed in another tab. Your other cards are unchanged.")
  if (card.archived || roleOf(workflow, card.column) !== "review") throw new BoardValidationError("Only a card in review can be approved or sent back.")
  const note = feedback?.trim() || null
  if (verdict === "changes_requested" && !note) throw new BoardValidationError("Say what to change when requesting changes.")
  const first = (role: string) => workflow.columns.find(column => column.role === role)?.id
  const column = verdict === "changes_requested" ? first("todo") ?? card.column
    : card.prUrl ? card.column : first("done") ?? card.column
  const body = verdict === "approved" ? (note ? `Approved: ${note}` : "Approved.") : `Changes requested: ${note}`
  return { type: "review", id, verdict, feedback: note, column, comment: { id: crypto.randomUUID(), body, author, createdAt: now } }
}
