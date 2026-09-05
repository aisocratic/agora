"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { Inbox, X } from "lucide-react"
import type { BoardData, CardDraft } from "../../lib/board"
import type { Suggestion, SuggestionList, SuggestionState } from "../../lib/suggestions"
import type { Workflow } from "../../lib/workflow"
import { TaskFields } from "../board/task-fields"
import "./suggestions.css"
class RequestError extends Error { constructor(message: string, readonly status: number) { super(message) } }
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, cache: "no-store", signal: AbortSignal.timeout(15000), ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) })
  const data = await response.json()
  if (!response.ok) throw new RequestError(data.error ?? "Suggestions are unavailable. Try again.", response.status)
  return data
}
export function SuggestionsInbox({ board, revision, workflow, ready, onRefresh, onOpenCard }: {
  board: BoardData; revision?: number; workflow: Workflow; ready: boolean; onRefresh: () => Promise<number>; onOpenCard: (id: string) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const drafts = useRef(new Map<string, CardDraft>())
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<SuggestionState | "all">("pending")
  const [list, setList] = useState<SuggestionList>({ suggestions: [], counts: { pending: 0, accepted: 0, dismissed: 0 }, limit: 50, offset: 0 })
  const [selected, setSelected] = useState<Suggestion | null>(null)
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [reviewRevision, setReviewRevision] = useState(revision ?? 0)
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [listError, setListError] = useState("")
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [hasUnapplied, setHasUnapplied] = useState(false)
  const generation = useRef(0)
  const load = useCallback(async (offset = 0) => {
    const current = ++generation.current
    try {
      const result = await request<SuggestionList>(`/api/suggestions?state=${filter}&limit=50&offset=${offset}`)
      if (generation.current === current) { setList(previous => offset ? { ...result, suggestions: [...previous.suggestions, ...result.suggestions] } : result); setListError("") }
    } catch (error) { if (generation.current === current) setListError(error instanceof Error ? error.message : "Suggestions could not be loaded.") }
  }, [filter])
  const invalidate = useCallback(() => { generation.current++ }, [])
  useEffect(() => {
    if (!ready) return
    const initial = setTimeout(() => void load(), 0)
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load() }, 5000)
    return () => { clearTimeout(initial); clearInterval(timer); invalidate() }
  }, [load, ready, invalidate])
  function show() { setOpen(true); dialog.current?.showModal(); void load() }
  function close() { dialog.current?.close(); setOpen(false) }
  async function choose(id: string, keepDraft = true) {
    setBusy(true); setError("")
    try {
      const [result, currentRevision] = await Promise.all([request<{ suggestion: Suggestion }>(`/api/suggestions/${id}`), onRefresh()])
      setSelected(result.suggestion); setHasUnapplied(keepDraft && drafts.current.has(id))
      setDraft(keepDraft && drafts.current.has(id) ? drafts.current.get(id)! : result.suggestion.reviewedDraft ?? result.suggestion.proposal)
      setReviewRevision(currentRevision); setNote(result.suggestion.decisionNote); setConflict(false)
    } catch (error) { setError(error instanceof Error ? error.message : "The suggestion could not be loaded.") }
    finally { setBusy(false) }
  }
  function change(value: CardDraft) { setDraft(value); setHasUnapplied(true); if (selected) drafts.current.set(selected.id, value) }
  async function review(action: "save" | "accept" | "dismiss") {
    if (!selected || !draft) return
    setBusy(true); setError("")
    try {
      const path = `/api/suggestions/${selected.id}${action === "save" ? "" : `/${action}`}`
      const input = action === "dismiss" ? { version: selected.version, note } : { version: selected.version, draft, ...(action === "accept" ? { revision: reviewRevision } : {}) }
      const { suggestion } = await request<{ suggestion: Suggestion }>(path, action === "save" ? "PATCH" : "POST", input)
      setSelected(suggestion); setDraft(suggestion.reviewedDraft ?? suggestion.proposal); drafts.current.delete(selected.id); setHasUnapplied(false)
      setReviewRevision(await onRefresh()); await load(); setConflict(false)
    } catch (error) { setError(error instanceof Error ? error.message : "Review failed. Your draft is kept."); if (error instanceof RequestError && error.status === 409) setConflict(true) }
    finally { setBusy(false) }
  }
  const total = filter === "all" ? Object.values(list.counts).reduce((sum, value) => sum + value, 0) : list.counts[filter]
  return <>
    <button type="button" className="agora-btn" disabled={!ready} aria-haspopup="dialog" onClick={show}><Inbox size={16} aria-hidden />Suggestions ({list.counts.pending})</button>
    <dialog ref={dialog} aria-labelledby="suggestions-title" className="agora-suggestions" onCancel={() => setOpen(false)}>
      <div className="suggestions-heading"><div><h2 id="suggestions-title">Suggestions inbox</h2><p>Review proposals before they become board cards.</p></div><button type="button" className="agora-btn" aria-label="Close suggestions" onClick={close}><X size={18} aria-hidden /></button></div>
      {open && <div className="suggestions-layout">
        <section className="suggestions-list" aria-label="Suggestion list">
          <label htmlFor="suggestion-filter">Review status</label><select id="suggestion-filter" value={filter} onChange={event => setFilter(event.target.value as SuggestionState | "all")}><option value="pending">Pending ({list.counts.pending})</option><option value="accepted">Accepted ({list.counts.accepted})</option><option value="dismissed">Dismissed ({list.counts.dismissed})</option><option value="all">All proposals</option></select>
          {listError && <div role="alert"><p>{listError}</p><button type="button" className="agora-btn" onClick={() => void load()}>Retry inbox</button></div>}
          {!listError && list.suggestions.length === 0 && <p className="suggestions-empty">{filter === "pending" ? "No pending suggestions. Agent proposals will appear here for review." : "No suggestions with this status."}</p>}
          <ul>{list.suggestions.map(suggestion => <li key={suggestion.id}><button type="button" aria-pressed={selected?.id === suggestion.id} disabled={busy} onClick={() => void choose(suggestion.id)}><strong>{(suggestion.reviewedDraft ?? suggestion.proposal).title}</strong><span>{suggestion.author.name} · {suggestion.state}</span></button></li>)}</ul>
          {list.suggestions.length < total && <button type="button" className="agora-btn" onClick={() => void load(list.suggestions.length)}>Load more suggestions</button>}
        </section>
        <section className="suggestions-review" aria-label="Suggestion review">
          {!selected || !draft ? <p className="suggestions-empty">Choose a proposal to read its details and review it.</p> : <>
            <div className="suggestions-provenance"><strong>Proposed by {selected.author.name}</strong><span>{new Date(selected.createdAt).toLocaleString()} · Version {selected.version}</span></div>
            {selected.reason && <p className="suggestions-reason">{selected.reason}</p>}
            {error && <div role="alert" className="suggestions-error"><p>{error}</p>{conflict && <><p>Your draft remains below. Refresh the review to load the latest board and suggestion before deciding again.</p><button type="button" className="agora-btn" disabled={busy} onClick={() => void choose(selected.id)}>Refresh review</button></>}</div>}
            <details className="suggestions-original"><summary>Original proposal</summary><h3>{selected.proposal.title}</h3><p>{selected.proposal.description || "No description."}</p></details>
            {selected.state === "pending" ? <form onSubmit={event => { event.preventDefault(); void review("accept") }} className="suggestions-form">
              <label htmlFor="suggestion-title">Proposed title</label><input id="suggestion-title" required maxLength={200} value={draft.title} disabled={busy} onChange={event => change({ ...draft, title: event.target.value })} />
              <label htmlFor="suggestion-description">Details</label><textarea id="suggestion-description" rows={5} maxLength={10000} value={draft.description} disabled={busy} onChange={event => change({ ...draft, description: event.target.value })} />
              <label htmlFor="suggestion-column">Destination column</label><select id="suggestion-column" value={draft.column} disabled={busy} onChange={event => change({ ...draft, column: event.target.value })}>{!workflow.columns.some(column => column.id === draft.column) && <option value={draft.column}>{draft.column} (unconfigured)</option>}{workflow.columns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}</select>
              <TaskFields draft={draft} onChange={change} board={board} workflow={workflow} prefix="suggestion-task" />
              <label htmlFor="suggestion-note">Dismissal note (optional)</label><textarea id="suggestion-note" rows={2} maxLength={2000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} />
              <p className="suggestions-help">Acceptance creates one card using this reviewed draft. It does not dispatch an agent.</p>
              <div className="suggestions-buttons"><button className="agora-btn" type="button" disabled={busy || conflict} onClick={() => void review("dismiss")}>Dismiss suggestion</button><button className="agora-btn" type="button" disabled={busy || conflict} onClick={() => void review("save")}>Save review draft</button><button className="agora-btn agora-primary" type="submit" disabled={busy || conflict}>{busy ? "Saving…" : "Accept into board"}</button></div>
            </form> : <div className="suggestions-decision">
              <h3>{selected.state === "accepted" ? "Accepted into the board" : "Suggestion dismissed"}</h3><p>Reviewed by {selected.reviewedBy}{selected.reviewedAt ? ` on ${new Date(selected.reviewedAt).toLocaleString()}` : ""}.</p>
              <h4>{(selected.reviewedDraft ?? selected.proposal).title}</h4><p>{(selected.reviewedDraft ?? selected.proposal).description}</p>{selected.decisionNote && <p>{selected.decisionNote}</p>}
              {selected.acceptedCardId && <button type="button" className="agora-btn agora-primary" onClick={() => { close(); void onOpenCard(selected.acceptedCardId!).catch(error => setError(error.message)) }}>Open accepted card</button>}
              {hasUnapplied && <details><summary>Your unapplied draft</summary><h4>{draft.title}</h4><p>{draft.description}</p></details>}
            </div>}
          </>}
          {error && !selected && <p role="alert" className="suggestions-error">{error}</p>}
        </section>
      </div>}
    </dialog>
  </>
}
