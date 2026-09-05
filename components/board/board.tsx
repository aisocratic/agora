"use client"

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
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
  COLUMNS,
  EMPTY_BOARD,
  isColumn,
  parseBoard,
  type BoardAction,
  type BoardCard,
  type CardDraft,
  type ColumnId,
} from "../../lib/board"
import { BoardStore, browserStorage } from "../../lib/board-storage"
import "./board.css"

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
}: {
  card?: BoardCard
  column: ColumnId
  onSave: (draft: CardDraft) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<CardDraft>({
    title: card?.title ?? "",
    description: card?.description ?? "",
    column: card?.column ?? column,
  })
  const [error, setError] = useState("")
  const fieldId = useId()
  return (
    <Modal title={card ? "Edit card" : "New card"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          try {
            onSave(draft)
            onClose()
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save this card.")
          }
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
              {COLUMNS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <p className="agora-dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="agora-dialog-actions">
          <button className="agora-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="agora-btn agora-primary" type="submit">
            {card ? "Save changes" : "Create card"}
          </button>
        </div>
      </form>
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
          {COLUMNS.map((column) => (
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

type Editor = { card?: BoardCard; column: ColumnId }
export function Board({ store: providedStore }: { store?: BoardStore }) {
  const [store] = useState(() => providedStore ?? makeStore())
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  useEffect(() => store.connect(), [store])
  const [editor, setEditor] = useState<Editor | null>(null)
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
  const { board, ready, error, readOnly, unsaved } = snapshot
  const archived = board.cards.filter((card) => card.archived)
  const active = board.cards.find((card) => card.id === activeId)
  const mutate = (action: BoardAction) => {
    try {
      store.dispatch(action)
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
    <div className="agora-board" aria-label="Agora board">
      <div className="agora-toolbar">
        <div>
          <h2>Your board</h2>
          <p>
            {!ready
              ? "Loading your board…"
              : unsaved
                ? "Unsaved changes in this tab"
                : "Saved in this browser · private to this device"}
          </p>
        </div>
        <div className="agora-actions">
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
            disabled={!ready || readOnly}
            onClick={() => file.current?.click()}
          >
            <Upload size={16} />
            Import
          </button>
          <button
            className="agora-btn agora-primary"
            type="button"
            disabled={!ready || readOnly}
            onClick={() => setEditor({ column: "backlog" })}
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
            store.replace(JSON.stringify({ version: 1, cards: [...current.cards, ...additions] }))
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
      {ready && !readOnly && (
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
              <div className="agora-columns">
                {COLUMNS.map((column) => (
                  <Column
                    key={column.id}
                    {...column}
                    cards={board.cards.filter(
                      (card) => card.column === column.id && !card.archived,
                    )}
                    onNew={() => setEditor({ column: column.id })}
                    onEdit={(card) => setEditor({ card, column: card.column })}
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
          key={editor.card?.id ?? "new"}
          {...editor}
          onClose={() => setEditor(null)}
          onSave={(draft) => {
            store.dispatch(
              editor.card
                ? { type: "edit", id: editor.card.id, draft }
                : { type: "create", id: crypto.randomUUID(), draft },
            )
            setMessage(editor.card ? "Card updated." : "Card created.")
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
              onClick={() => {
                try {
                  if (confirmation === "reset") store.replace(JSON.stringify(EMPTY_BOARD))
                  else store.dispatch({ type: "delete", id: confirmation.id })
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
    </div>
  )
}
