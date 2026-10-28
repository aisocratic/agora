"use client"

import { useState } from "react"
import { CircleCheck, GitPullRequest, MessageSquareWarning } from "lucide-react"
import type { BoardCard } from "../../lib/board"
import type { ReviewStatus } from "../../lib/review"

/* A person's verdict, for a card in review: Approve, or Request changes with
   feedback for the agent (required). Approving a card with a PR keeps it in
   review for the merge; without one it moves to done. Requesting changes sends
   it back to todo. Follows the AI Socratic website's review panel. */
export function ReviewPanel({ card, onReview }: { card: BoardCard; onReview: (verdict: ReviewStatus, feedback: string) => Promise<void> }) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const submit = async (verdict: ReviewStatus) => {
    if (busy) return
    if (verdict === "changes_requested" && !note.trim()) { setError("Describe the changes you want first."); return }
    setBusy(true); setError("")
    try { await onReview(verdict, note.trim()); setNote("") }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit the review.") }
    finally { setBusy(false) }
  }
  return <section className="agora-review-panel" aria-label="Review">
    <header>
      <h3>Review</h3>
      {card.prUrl && <a href={card.prUrl} target="_blank" rel="noreferrer"><GitPullRequest size={12} aria-hidden="true" />{card.prUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "")}</a>}
    </header>
    {card.reviewStatus && <ReviewVerdict card={card} detailed />}
    <textarea aria-label="Review feedback" maxLength={10000} rows={3} placeholder="Feedback for the agent — required when requesting changes…" value={note} onChange={event => setNote(event.target.value)} />
    {error && <p className="agora-dialog-error" role="alert">{error}</p>}
    <div className="agora-dialog-actions">
      <button type="button" className="agora-btn" disabled={busy || !note.trim()} onClick={() => void submit("changes_requested")}><MessageSquareWarning size={14} aria-hidden="true" />Request changes</button>
      <button type="button" className="agora-btn agora-primary" disabled={busy} onClick={() => void submit("approved")}><CircleCheck size={14} aria-hidden="true" />Approve</button>
    </div>
  </section>
}

/* The last verdict: a green check when approved, an amber note when changes
   were requested, with the feedback in the tooltip (or spelled out). */
export function ReviewVerdict({ card, detailed = false }: { card: BoardCard; detailed?: boolean }) {
  if (!card.reviewStatus) return null
  const approved = card.reviewStatus === "approved"
  const label = `${approved ? "Review: approved" : "Review: changes requested"}${card.reviewFeedback ? ` — ${card.reviewFeedback}` : ""}`
  const Icon = approved ? CircleCheck : MessageSquareWarning
  if (detailed) return <p className="agora-review-verdict" data-verdict={card.reviewStatus}><Icon size={14} aria-hidden="true" /><span>{approved ? "Approved" : "Changes requested"}{card.reviewFeedback ? `: ${card.reviewFeedback}` : ""}</span></p>
  return <span className="agora-review-verdict" data-verdict={card.reviewStatus} role="img" aria-label={label} title={label}><Icon size={13} aria-hidden="true" /></span>
}
