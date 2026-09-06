"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@aisocratic/design/components/dialog"
import { BoardSelect } from "./board-select"
import { Archive, Check, CornerDownRight, X } from "lucide-react"
import type { BoardCard, BoardData, CardDraft } from "../../lib/board"
import type { BoardController } from "../../lib/board-storage"
import type { Workflow } from "../../lib/workflow"
import { TaskFields } from "./task-fields"
import { QuickAdd } from "./quick-add"
import { PriorityStar } from "./priority-star"

export function WorkspaceEditor({ card, column, newId, board, store, workflow, onClose, onOpenCard }: {
  card?: BoardCard; column: string; newId?: string; board: BoardData; store: BoardController; workflow: Workflow
  onClose: () => void; onOpenCard: (card: BoardCard) => void
}) {
  const [draft, setDraft] = useState<CardDraft>(() => card ? { ...card } : { title: "", description: "", column, type: "task", priority: 1 })
  const current = useRef(draft)
  const saved = useRef(JSON.stringify(draft))
  const [id] = useState(() => card?.id ?? newId ?? crypto.randomUUID())
  const [created, setCreated] = useState(!!card)
  const exists = useRef(!!card)
  const [saveState, setSaveState] = useState("Saved")
  const [error, setError] = useState("")
  const [comment, setComment] = useState("")
  const [posting, setPosting] = useState(false)
  const postingRef = useRef(false)
  const [showAllChildren, setShowAllChildren] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef<Promise<void> | null>(null)
  const prefix = useId()
  const latest = board.cards.find(item => item.id === id)
  const children = board.cards.filter(item => item.parentId === id && !item.archived)
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    return () => { clearTimer(); previous?.focus({ preventScroll: true }) }
  }, [])

  // Serialize saves and drain the latest draft: typing during a save can never
  // let an older completion overwrite or mark a newer draft as saved.
  const flush = async () => {
    clearTimer()
    if (saving.current) { await saving.current; return }
    if (exists.current && JSON.stringify(current.current) === saved.current) return
    const operation = async () => {
      try {
        setError("")
        while (!exists.current || JSON.stringify(current.current) !== saved.current) {
          const next = { ...current.current, title: current.current.title.trim() }
          if (!next.title) throw new Error("Give the task a title before saving.")
          const snapshot = JSON.stringify(current.current)
          setSaveState("Saving…")
          await store.dispatch(exists.current ? { type: "edit", id: id, draft: next } : { type: "create", id: id, draft: next })
          exists.current = true
          setCreated(true)
          saved.current = snapshot
        }
        setSaveState(store.getSnapshot().unsaved ? "Unsaved in this tab" : "Saved")
      } catch (cause) {
        setSaveState("Not saved")
        setError(cause instanceof Error ? cause.message : "Could not save this task.")
        throw cause
      }
    }
    saving.current = operation()
    try { await saving.current } finally { saving.current = null }
  }
  const change = (next: CardDraft) => {
    current.current = next
    setDraft(next)
    setSaveState("Unsaved changes")
    clearTimer()
    if (exists.current) timer.current = setTimeout(() => { void flush().catch(() => {}) }, 600)
  }
  const close = async () => {
    if (!exists.current) { onClose(); return }
    try { await flush(); onClose() } catch { /* Keep the draft open for correction or retry. */ }
  }
  const run = async (action: () => Promise<void>) => {
    try { await flush(); await action() }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not finish this action.") }
  }
  return <Dialog open onOpenChange={open => { if (!open) void close() }}><DialogContent showCloseButton={false} className="agora-dialog agora-workspace-editor" aria-describedby={undefined}>
    <DialogTitle className="agora-sr-only">{created ? "Task details" : "New task"}</DialogTitle>
    <header className="agora-editor-heading">
      <textarea rows={2} autoFocus aria-label="Title" placeholder="Task title" maxLength={200} value={draft.title} onChange={event => change({ ...draft, title: event.target.value })} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur() } }} />
      <button className="agora-priority" aria-label={`Set priority ${(draft.priority ?? 1) % 3 + 1}`} title="Change priority" onClick={() => change({ ...draft, priority: (draft.priority ?? 1) % 3 + 1 })}><PriorityStar priority={draft.priority} size={16} /></button>
      <button className="agora-icon" aria-label="Close task" onClick={() => void close()}><X size={16} /></button>
    </header>
    <div className="agora-editor-identity">
      <label>Status<BoardSelect aria-label="Status" value={draft.column} onValueChange={value => change({ ...draft, column: value })} options={workflow.columns.map(item => ({value:item.id,label:item.label}))} /></label>
      <label>Type<BoardSelect aria-label="Type" value={draft.type ?? "task"} onValueChange={value => change({ ...draft, type: value })} options={workflow.types.map(item => ({value:item.id,label:item.label}))} /></label>
      <label>Assignee<BoardSelect aria-label="Assignee" value={draft.assignee ?? ""} onValueChange={value => change({ ...draft, assignee: value || null })} options={[{value:"",label:"Unassigned"}, ...workflow.people.map(item => ({value:item.id,label:item.label}))]} /></label>
    </div>
    <label className="agora-sr-only" htmlFor={`${prefix}-description`}>Description</label>
    <textarea className="agora-editor-description" id={`${prefix}-description`} placeholder="Add context, a plan, or acceptance criteria…" maxLength={10000} value={draft.description} onChange={event => change({ ...draft, description: event.target.value })} />
    <TaskFields hideIdentity draft={draft} onChange={change} board={board} card={latest} workflow={workflow} prefix={prefix} />
    {created && <section className="agora-editor-subtasks" aria-label="Subtasks">
      <QuickAdd label="Add subtask" onAdd={async title => {
        await flush()
        await store.dispatch({ type: "create", id: crypto.randomUUID(), draft: { title, description: "", column: current.current.column, parentId: id, type: "task", priority: 1 } })
      }} />
      {(showAllChildren ? children : children.slice(0, 5)).map(child => <button key={child.id} className="agora-editor-child" onClick={() => void run(async () => onOpenCard(child))}><CornerDownRight size={13} /><span>{child.title}</span><span className="agora-badge" data-tone={child.column}>{workflow.columns.find(item => item.id === child.column)?.label ?? child.column}</span></button>)}
      {children.length > 5 && <button className="agora-focus-more" onClick={() => setShowAllChildren(!showAllChildren)}>{showAllChildren ? "Show less" : `Show all (${children.length})`}</button>}
    </section>}
    {created && <section className="agora-comments" aria-label="Comments">
      <h3>Comments <span>{latest?.comments?.length ?? 0}</span></h3>
      {(latest?.comments ?? []).map(item => <article key={item.id}><p><b>{item.author}</b><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></p><p>{item.body}</p></article>)}
      <textarea aria-label="Add a comment" placeholder="Leave a note for the next person or agent…" maxLength={10000} value={comment} onChange={event => setComment(event.target.value)} />
      <button className="agora-btn" disabled={posting || !comment.trim()} onClick={async () => {
        if (postingRef.current) return
        postingRef.current = true; setPosting(true)
        await run(async () => {
          await store.dispatch({ type: "comment", id: id, comment: { id: crypto.randomUUID(), body: comment.trim(), author: "You", createdAt: new Date().toISOString() } })
          setComment("")
        })
        postingRef.current = false; setPosting(false)
      }}>{posting ? "Posting…" : "Comment"}</button>
    </section>}
    {error && <p className="agora-dialog-error" role="alert">{error}</p>}
    <footer className="agora-editor-footer">
      {created && <button className="agora-btn" onClick={() => void run(async () => { await store.dispatch({ type: "archive", id: id }); onClose() })}><Archive size={13} />Archive task</button>}
      <span role="status" className="agora-editor-save">{created && <>{saveState === "Saved" && <Check size={12} />}{saveState}</>}</span>
      <button className="agora-btn" onClick={() => void close()}>{created ? "Close" : "Cancel"}</button>
      <button className="agora-btn agora-primary" disabled={!draft.title.trim() || saveState === "Saving…"} onClick={() => void run(async () => { if (!card) onClose() })}>{created ? "Save now" : "Create task"}</button>
    </footer>
  </DialogContent></Dialog>
}
