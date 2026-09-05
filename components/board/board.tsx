"use client"

import { DependencyGraph } from "../graph/dependency-graph"
import { SuggestionsInbox } from "../suggestions/inbox"
import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Archive, ArrowDown, ArrowUp, Download, GripVertical, Plus, Upload, X } from "lucide-react"
import {
  EMPTY_BOARD,
  isColumn,
  parseBoard,
  type BoardAction,
  type BoardCard,
  type CardDraft,
  type ColumnId,
} from "../../lib/board"
import { RemoteBoardStore } from "../../lib/remote-board-store"
import { BoardStore, browserStorage, type BoardController } from "../../lib/board-storage"
import { DEFAULT_WORKFLOW, type Workflow } from "../../lib/workflow"
import { TaskFields } from "./task-fields"
import "./board.css"

const WorkflowContext = createContext({ workflow: DEFAULT_WORKFLOW, columns: DEFAULT_WORKFLOW.columns.map(({ id, label }) => ({ id, label })) })

const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args).filter((hit) => hit.id !== args.active.id)
  const cards = hits.filter((hit) => !String(hit.id).startsWith("column:"))
  return cards.length
    ? cards
    : hits.length
      ? hits
      : rectIntersection(args).filter((hit) => hit.id !== args.active.id)
}

function makeStore() {
  try {
    return new BoardStore(browserStorage(window.localStorage, window))
  } catch {
    return new BoardStore({
      read: () => {
        throw new Error("Storage unavailable")
      },
      write: () => {
        throw new Error("Storage unavailable")
      },
      subscribe: () => () => {},
    })
  }
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      previous?.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="agora-dialog"
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="agora-dialog-head">
        <h2 id={heading}>{title}</h2>
        <button className="agora-icon" type="button" aria-label="Close dialog" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  )
}

function CardEditor({
  card,
  column,
  onSave,
  onClose,
  board,
  onComment,
  onDispatch,
}: {
  onComment?: (body: string) => Promise<void>
  onDispatch?: (key: string) => Promise<string>
  board: import("../../lib/board").BoardData
  card?: BoardCard
  column: ColumnId
  onSave: (draft: CardDraft) => void | Promise<void>
  onClose: () => void
}) {
  const { workflow, columns } = useContext(WorkflowContext)
  const [draft, setDraft] = useState<CardDraft>({
    title: card?.title ?? "",
    description: card?.description ?? "",
    column: card?.column ?? column,
    type: card?.type, assignee: card?.assignee, effort: card?.effort, model: card?.model, harness: card?.harness,
    prUrl: card?.prUrl, automerge: card?.automerge, needsHumanReview: card?.needsHumanReview,
    parentId: card?.parentId, dependencies: card?.dependencies,
  })
  const [comment, setComment] = useState("")
  const [dispatchMessage, setDispatchMessage] = useState("")
  const dispatchKey = useRef<string | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const draftChanged = !!card && (Object.keys(draft) as (keyof CardDraft)[]).some((key) => JSON.stringify(draft[key]) !== JSON.stringify(card[key]))
  const fieldId = useId()
  return (
    <Modal title={card ? "Edit card" : "New card"} onClose={() => { if (!saving) onClose() }}>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (saving) return
          setSaving(true)
          setError("")
          try {
            await onSave(draft)
            onClose()
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save this card.")
          } finally { setSaving(false) }
        }}
      >
        <div className="agora-fields">
          <div>
            <label htmlFor={`${fieldId}-title`}>Title</label>
            <input
              id={`${fieldId}-title`}
              name="title"
              required
              maxLength={200}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="What needs to happen?"
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-details`}>Details</label>
            <textarea
              id={`${fieldId}-details`}
              name="description"
              maxLength={10000}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="Context, decisions and the next step…"
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-column`}>Column</label>
            <select
              id={`${fieldId}-column`}
              name="column"
              value={draft.column}
              onChange={(event) => {
                if (isColumn(event.target.value)) setDraft({ ...draft, column: event.target.value })
              }}
            >
              {columns.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <TaskFields draft={draft} onChange={setDraft} board={board} card={card} workflow={workflow} prefix={fieldId} />
        {error && (
          <p className="agora-dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="agora-dialog-actions">
          <button className="agora-btn" type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="agora-btn agora-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : card ? "Save changes" : "Create card"}
          </button>
        </div>
      </form>
      {card && <section className="agora-comments" aria-label="Card comments">
        <h3>Comments</h3>
        {(board.cards.find((item) => item.id === card.id)?.comments ?? []).map((item) => <article key={item.id}><p><b>{item.author}</b> · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></p><p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p></article>)}
        <label htmlFor={`${fieldId}-comment`}>Add a comment</label>
        <textarea id={`${fieldId}-comment`} maxLength={10000} value={comment} onChange={(event) => setComment(event.target.value)} />
        <button type="button" className="agora-btn" disabled={saving || !comment.trim()} onClick={async () => {
          setSaving(true); setError("")
          try { await onComment?.(comment); setComment("") } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add this comment.") } finally { setSaving(false) }
        }}>Add comment</button>
        {onDispatch && <div className="agora-dispatch"><button type="button" className="agora-btn" disabled={saving || draftChanged} onClick={async () => {
          setSaving(true); setDispatchMessage("")
          dispatchKey.current ??= crypto.randomUUID()
          try { setDispatchMessage(await onDispatch(dispatchKey.current)) } catch (cause) { setDispatchMessage(cause instanceof Error ? cause.message : "Dispatch outcome could not be confirmed; check before retrying.") } finally { setSaving(false) }
        }}>Dispatch saved task</button><p>Dispatch uses the saved task. Save any changes first.</p>{dispatchMessage && <p role="status">{dispatchMessage}</p>}</div>}
      </section>}
    </Modal>
  )
}

function SortableCard({
  card,
  index,
  count,
  onEdit,
  onAction,
}: {
  card: BoardCard
  index: number
  count: number
  onEdit: () => void
  onAction: (action: BoardAction) => void
}) {
  const { columns } = useContext(WorkflowContext)
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id })
  return (
    <article
      ref={setNodeRef}
      className="agora-card"
      data-card-id={card.id}
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="agora-card-top">
        <button
          className="agora-card-title"
          type="button"
          aria-label={`Edit ${card.title}`}
          onClick={onEdit}
        >
          {card.title}
        </button>
        <button
          ref={setActivatorNodeRef}
          className="agora-icon agora-drag"
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${card.title}`}
        >
          <GripVertical />
        </button>
      </div>
      {card.description && <p className="agora-card-description">{card.description}</p>}
      <div className="agora-card-foot">
        <select
          aria-label={`Move ${card.title} to column`}
          value={card.column}
          onChange={(event) => {
            if (isColumn(event.target.value))
              onAction({
                type: "move",
                id: card.id,
                column: event.target.value,
                position: Number.MAX_SAFE_INTEGER,
              })
          }}
        >
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.label}
            </option>
          ))}
        </select>
        <button
          className="agora-icon"
          type="button"
          disabled={index === 0}
          aria-label={`Move ${card.title} up`}
          onClick={() =>
            onAction({ type: "move", id: card.id, column: card.column, position: index - 1 })
          }
        >
          <ArrowUp />
        </button>
        <button
          className="agora-icon"
          type="button"
          disabled={index === count - 1}
          aria-label={`Move ${card.title} down`}
          onClick={() =>
            onAction({ type: "move", id: card.id, column: card.column, position: index + 1 })
          }
        >
          <ArrowDown />
        </button>
        <button
          className="agora-icon"
          type="button"
          aria-label={`Archive ${card.title}`}
          onClick={() => onAction({ type: "archive", id: card.id })}
        >
          <Archive />
        </button>
      </div>
    </article>
  )
}

function Column({
  id,
  label,
  cards,
  onNew,
  onEdit,
  onAction,
}: {
  id: ColumnId
  label: string
  cards: BoardCard[]
  onNew: () => void
  onEdit: (card: BoardCard) => void
  onAction: (action: BoardAction) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${id}` })
  return (
    <section
      ref={setNodeRef}
      className="agora-column"
      data-column={id}
      data-over={isOver}
      aria-label={`${label} column`}
    >
      <div className="agora-column-head">
        <h3>
          {label}
          <span className="agora-count" aria-label={`${cards.length} cards`}>
            {cards.length}
          </span>
        </h3>
        <button
          className="agora-icon"
          type="button"
          aria-label={`Add card to ${label}`}
          onClick={onNew}
        >
          <Plus />
        </button>
      </div>
      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <div className="agora-cards">
          {cards.map((card, index) => (
            <SortableCard
              key={card.id}
              card={card}
              index={index}
              count={cards.length}
              onEdit={() => onEdit(card)}
              onAction={onAction}
            />
          ))}
        </div>
      </SortableContext>
      {cards.length === 0 && (
        <div className="agora-empty">No cards yet. Add one or drop it here.</div>
      )}
    </section>
  )
}

type Editor = { card?: BoardCard; column: ColumnId; revision?: number; newId?: string }
export function Board({ store: providedStore, mode = "local", workflow: providedWorkflow = DEFAULT_WORKFLOW }: { store?: BoardController; mode?: "local" | "shared"; workflow?: Workflow }) {
  const [store] = useState<BoardController>(() => providedStore ?? (mode === "shared" ? new RemoteBoardStore() : makeStore()))
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  useEffect(() => store.connect(), [store])
  const [editor, setEditor] = useState<Editor | null>(null)
  const [view, setView] = useState<"board" | "graph">("board")
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<BoardCard | "reset" | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [backupDownloaded, setBackupDownloaded] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const { board, ready, error, readOnly, unsaved, pending } = snapshot
  const workflow = snapshot.workflow ?? providedWorkflow
  const columns = [...workflow.columns.map(({ id, label }) => ({ id, label })), ...[...new Set(board.cards.map((card) => card.column))].filter((id) => !workflow.columns.some((column) => column.id === id)).map((id) => ({ id, label: `${id} (unconfigured)` }))]
  const initialColumn = workflow.columns.find((column) => column.role === "backlog")?.id ?? workflow.columns[0].id
  const archived = board.cards.filter((card) => card.archived)
  const active = board.cards.find((card) => card.id === activeId)
  const mutate = async (action: BoardAction) => {
    try {
      await store.dispatch(action)
      setMessage(
        action.type === "archive"
          ? "Card archived. You can restore it from Archive."
          : "Board updated.",
      )
    } catch (cause) {
      setMessage(
        `Could not update the board. ${cause instanceof Error ? cause.message : "Try again."}`,
      )
    }
  }
  const download = () => {
    const blob = new Blob([store.export()], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `agora-board-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setBackupDownloaded(true)
  }
  const dragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over || dragged.id === over.id) return
    const target = board.cards.find((card) => card.id === over.id)
    const columnId = target?.column ?? String(over.id).replace(/^column:/, "")
    if (!isColumn(columnId)) return
    const destination = board.cards.filter((card) => card.column === columnId && !card.archived)
    const position = target
      ? destination.findIndex((card) => card.id === target.id)
      : destination.length
    mutate({ type: "move", id: String(dragged.id), column: columnId, position })
  }
  return (
    <WorkflowContext.Provider value={{ workflow, columns }}><div className="agora-board" aria-label="Agora board">
      <div className="agora-toolbar">
        <div>
          <h2>Your board</h2>
          <p>
            {!ready
              ? "Loading your board…"
              : unsaved
                ? "Unsaved changes in this tab"
                : pending ? "Saving to shared board…"
                  : mode === "shared" ? "Shared board · saved in Postgres · updates automatically"
                    : "Saved in this browser · private to this device"}
          </p>
        </div>
        <div className="agora-actions">
          {mode === "shared" && <SuggestionsInbox board={board} revision={snapshot.revision} workflow={workflow} ready={ready} onRefresh={async () => { await store.refresh?.(); return store.getSnapshot().revision ?? 0 }} onOpenCard={async (id) => {
            await store.refresh?.(); const latest = store.getSnapshot(); const card = latest.board.cards.find(card => card.id === id)
            if (card) setEditor({ card, column: card.column, revision: latest.revision })
            else setMessage("That accepted card is no longer on the board. Its suggestion history is retained.")
          }} />}


          <button
            className="agora-btn"
            type="button"
            disabled={!ready}
            onClick={() => setArchiveOpen(!archiveOpen)}
            aria-expanded={archiveOpen}
          >
            <Archive size={16} />
            Archive ({archived.length})
          </button>
          <button className="agora-btn" type="button" disabled={!ready} onClick={download}>
            <Download size={16} />
            Export
          </button>
          <button
            className="agora-btn"
            type="button"
            disabled={!ready || readOnly || pending}
            onClick={() => file.current?.click()}
          >
            <Upload size={16} />
            Import
          </button>
          <button
            className="agora-btn agora-primary"
            type="button"
            disabled={!ready || readOnly || pending}
            onClick={() => setEditor({ column: initialColumn, revision: snapshot.revision, newId: crypto.randomUUID() })}
          >
            <Plus size={16} />
            New card
          </button>
        </div>
      </div>
      <input
        ref={file}
        className="agora-sr-only"
        type="file"
        accept=".json,application/json"
        aria-label="Import board backup"
        tabIndex={-1}
        onChange={async (event) => {
          const selected = event.target.files?.[0]
          event.target.value = ""
          if (!selected) return
          try {
            const incoming = parseBoard(await selected.text())
            const current = store.getSnapshot().board
            const ids = new Set(current.cards.map((card) => card.id))
            const additions = incoming.cards.filter((card) => !ids.has(card.id))
            await store.replace(JSON.stringify({ version: 1, cards: [...current.cards, ...additions] }))
            setMessage(`Imported ${additions.length} cards. Existing cards were kept.`)
          } catch {
            setMessage("Could not import this backup. Your existing board has not changed.")
          }
        }}
      />
      {error && (
        <div className="agora-notice" role="alert">
          <p>{error}</p>
          {readOnly && (
            <div className="agora-actions">

              <button className="agora-btn" onClick={download}>
                Download saved data
              </button>
              <button
                className="agora-btn"
                disabled={!backupDownloaded}
                onClick={() => setConfirmation("reset")}
              >
                Start a new board
              </button>
            </div>
          )}
        </div>
      )}
      <p className="agora-sr-only" role="status" aria-live="polite">
        {message}
      </p>
      {message.startsWith("Could not") && (
        <p className="agora-notice" role="alert">
          {message}
        </p>
      )}
      {ready && !readOnly && <div className="agora-view-switch" role="group" aria-label="Board view"><button className="agora-btn" aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button><button className="agora-btn" aria-pressed={view === "graph"} onClick={() => setView("graph")}>Graph</button></div>}
      {ready && !readOnly && view === "graph" && <DependencyGraph board={board} workflow={workflow} onOpenCard={card => setEditor({ card, column: card.column, revision: snapshot.revision })} />}
      {ready && !readOnly && view === "board" && (
        <>
          <DndContext
            sensors={sensors}
            autoScroll={{
              canScroll: (element) =>
                element.classList.contains("agora-scroll") ||
                element.classList.contains("agora-column"),
            }}
            collisionDetection={collisionDetection}
            onDragStart={(event) => setActiveId(String(event.active.id))}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={dragEnd}
          >
            <div
              className="agora-scroll"
              tabIndex={0}
              role="region"
              aria-label="Board columns; scroll horizontally to see all columns"
            >
              <div className="agora-columns" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(var(--agora-column-width, 15rem), 1fr))`, minWidth: `calc(${columns.length} * (var(--agora-column-width, 15rem) + 1rem))` }}>
                {columns.map((column) => (
                  <Column
                    key={column.id}
                    {...column}
                    cards={board.cards.filter(
                      (card) => card.column === column.id && !card.archived,
                    )}
                    onNew={() => setEditor({ column: column.id, revision: snapshot.revision, newId: crypto.randomUUID() })}
                    onEdit={(card) => setEditor({ card, column: card.column, revision: snapshot.revision })}
                    onAction={mutate}
                  />
                ))}
              </div>
            </div>
            <DragOverlay>
              {active ? <div className="agora-card">{active.title}</div> : null}
            </DragOverlay>
          </DndContext>
          <p className="agora-help">
            Drag a card by its handle, or use its column selector and arrow buttons. Scroll sideways
            for more columns on a small screen.
          </p>
        </>
      )}
      {archiveOpen && (
        <section className="agora-archive" aria-label="Archived cards">
          {archived.length ? (
            archived.map((card) => (
              <div className="agora-archive-row" key={card.id}>
                <p>{card.title}</p>
                <div className="agora-actions">

                  <button
                    className="agora-btn"
                    onClick={() => mutate({ type: "restore", id: card.id })}
                    aria-label={`Restore ${card.title}`}
                  >
                    Restore
                  </button>
                  <button
                    className="agora-btn agora-danger"
                    onClick={() => setConfirmation(card)}
                    aria-label={`Delete ${card.title} permanently`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="agora-empty">
              No archived cards. Archived cards stay here until you restore or delete them.
            </p>
          )}
        </section>
      )}
      {editor && (
        <CardEditor
          key={editor.card?.id ?? editor.newId}
          {...editor}
          board={board}
          onComment={editor.card ? async (body) => {
            try {
              await store.dispatch({ type: "comment", id: editor.card!.id, comment: { id: crypto.randomUUID(), body, author: "You", createdAt: new Date().toISOString() } }, editor.revision)
              setEditor({ ...editor, revision: store.getSnapshot().revision })
            } catch (error) { setEditor({ ...editor, revision: store.getSnapshot().revision }); throw error }
          } : undefined}
          onDispatch={editor.card && store.launch ? async (key) => {
            const result = await store.launch!(editor.card!.id, key, editor.revision)
            return `${result.status}: ${result.message} Dispatch ID: ${result.id}`
          } : undefined}
          onClose={() => setEditor(null)}
          onSave={async (draft) => {
            try {
            await store.dispatch(
              editor.card
                ? { type: "edit", id: editor.card.id, draft }
                : { type: "create", id: editor.newId!, draft },
              editor.revision,
            )
            setMessage(editor.card ? "Card updated." : "Card created.")
            } catch (error) {
              setEditor({ ...editor, revision: store.getSnapshot().revision })
              throw error
            }
          }}
        />
      )}
      {confirmation && (
        <Modal
          title={confirmation === "reset" ? "Start a new board?" : "Delete this card?"}
          onClose={() => setConfirmation(null)}
        >
          <p>
            {confirmation === "reset"
              ? "This replaces the unreadable saved data with an empty board. Keep your downloaded backup."
              : `“${confirmation.title}” will be permanently deleted. This cannot be undone.`}
          </p>
          <div className="agora-dialog-actions">
            <button className="agora-btn" onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <button
              className="agora-btn agora-danger"
              disabled={pending}
              onClick={async () => {
                try {
                  if (confirmation === "reset") await store.replace(JSON.stringify(EMPTY_BOARD))
                  else await store.dispatch({ type: "delete", id: confirmation.id })
                  setConfirmation(null)
                  setMessage("Board updated.")
                } catch {
                  setMessage("Could not save this change. Your existing data has been kept.")
                  setConfirmation(null)
                }
              }}
            >
              {confirmation === "reset" ? "Start new board" : "Delete permanently"}
            </button>
          </div>
        </Modal>
      )}
    </div></WorkflowContext.Provider>
  )
}
