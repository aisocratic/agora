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
import { Archive, ArrowDown, ArrowUp, Download, GripVertical, Plus, Upload, X, GitMerge, UserCheck, Link2, LayoutGrid, Target, Search, ChevronRight, Pencil, Eye, Rows3, Layers, SlidersHorizontal, MoreHorizontal, ChevronsDownUp, ChevronsUpDown, MessageSquare, GitPullRequest } from "lucide-react"
import {
  EMPTY_BOARD,
  isColumn,
  parseBoard,
  updateBoard,
  type BoardAction,
  type BoardCard,
  type CardDraft,
  type ColumnId,
} from "../../lib/board"
import { RemoteBoardStore } from "../../lib/remote-board-store"
import { BoardStore, browserStorage, type BoardController } from "../../lib/board-storage"
import { DEFAULT_WORKFLOW, type Workflow } from "../../lib/workflow"
import { WorkspaceEditor } from "./workspace-editor"
import { QuickAdd } from "./quick-add"
import { PriorityStar } from "./priority-star"
import { BulkActions, type BulkCommand } from "./bulk-actions"
import { BoardSelect } from "./board-select"
import { TaskFields } from "./task-fields"
import { BoardMenu, CheckMenu, useBoardPreferences } from "./view-controls"
import { FocusView } from "./focus-view"
import { SORT_OPTIONS, sortCards, type ColumnSort } from "../../lib/board-view"
import "./board.css"

const SelectionContext = createContext<{ enabled: boolean; selected: Set<string>; toggle: (id: string) => void }>({ enabled: false, selected: new Set(), toggle: () => {} })

const DisplayContext = createContext({ description: true, metadata: true, compact: false, priority: true, type: true, assignee: true })

const WorkflowContext = createContext({ workflow: DEFAULT_WORKFLOW, columns: DEFAULT_WORKFLOW.columns.map(({ id, label }) => ({ id, label })) })

let lastDragEndAt = 0

const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args).filter((hit) => hit.id !== args.active.id)
  const edges = hits.filter(hit => String(hit.id).startsWith("edge:"))
  if (edges.length) return edges
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
    priority: card?.priority, type: card?.type, assignee: card?.assignee, effort: card?.effort, model: card?.model, harness: card?.harness,
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
  compact = false,
  showActions = true,
  childCount = 0,
  expanded,
  onToggleChildren,
}: {
  compact?: boolean
  showActions?: boolean
  childCount?: number
  expanded?: boolean
  onToggleChildren?: () => void
  card: BoardCard
  index: number
  count: number
  onEdit: () => void
  onAction: (action: BoardAction) => void
}) {
  const { columns, workflow } = useContext(WorkflowContext)
  const display = useContext(DisplayContext)
  const selection = useContext(SelectionContext)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(card.title)
  const finishRename = () => {
    if (title.trim() && title.trim() !== card.title) onAction({ type: "edit", id: card.id, draft: { ...card, title: title.trim() } })
    setRenaming(false)
  }
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
      data-compact={compact || display.compact}
      data-card-id={card.id}
      data-selected={selection.selected.has(card.id) || undefined}
      tabIndex={selection.enabled ? 0 : undefined}
      aria-label={selection.enabled ? card.title : undefined}
      onClickCapture={event => {
        if (!selection.enabled || !(event.metaKey || event.ctrlKey || event.shiftKey) || Date.now() - lastDragEndAt < 250) return
        const target = event.target as HTMLElement
        if (target.closest("input, select, textarea, a") || (target.closest("button") && !target.closest(".agora-card-title"))) return
        event.preventDefault(); event.stopPropagation(); selection.toggle(card.id)
      }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !selection.enabled) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          if (event.metaKey || event.ctrlKey || event.shiftKey) selection.toggle(card.id)
          else onEdit()
        }
      }}
      data-dragging={isDragging}
      style={{ transform: selection.enabled && isDragging ? undefined : CSS.Transform.toString(transform), transition }}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement
        if (!target.closest("button, input, select, textarea, a") || target.closest("button.agora-card-title")) listeners?.onPointerDown?.(event)
      }}
      onClick={(event) => {
        if (Date.now() - lastDragEndAt < 250 || (event.target as HTMLElement).closest("button, input, select, textarea, a")) return
        onEdit()
      }}
    >
      <div className="agora-card-top">
        {renaming ? <input className="agora-card-title agora-inline-title" aria-label={`Rename ${card.title}`} autoFocus value={title} onChange={event => setTitle(event.target.value)} onBlur={finishRename} onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); finishRename() }
          if (event.key === "Escape") { event.preventDefault(); setRenaming(false) }
        }} /> : <button
          className="agora-card-title"
          type="button"
          aria-label={`Rename ${card.title}`}
          title="Click to rename"
          onClick={() => { if (Date.now() - lastDragEndAt < 250) return; setTitle(card.title); setRenaming(true) }}
        >
          {card.title}
        </button>}
        {compact && childCount > 0 && <span className="agora-compact-child-count" title={`${childCount} subtasks`}>{childCount}</span>}
        <button className="agora-edit" aria-label={`Edit ${card.title}`} onClick={onEdit}><Pencil size={12} /></button>
        {display.priority && <button className="agora-priority" type="button" aria-label={`Priority ${card.priority ?? 1} for ${card.title}; click to cycle`} title="Click to change priority" onClick={() => onAction({ type: "edit", id: card.id, draft: { ...card, priority: (card.priority ?? 1) % 3 + 1 } })}>
          <PriorityStar priority={card.priority} />
        </button>}
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
      {display.description && card.description && <p className="agora-card-description">{card.description}</p>}
      {display.metadata && <div className="agora-card-meta">
        {display.type && (childCount > 0 && onToggleChildren ? <button className="agora-badge agora-epic-badge" data-tone={card.type ?? "task"} aria-label={`Toggle subtasks of ${card.title}`} aria-expanded={expanded} onClick={onToggleChildren}>{workflow.types.find(type => type.id === card.type)?.label ?? card.type ?? "Task"} ({childCount})<ChevronRight size={12} style={{ transform: expanded ? "rotate(90deg)" : undefined }} /></button> : <span className="agora-badge" data-tone={card.type ?? "task"}>{workflow.types.find(type => type.id === card.type)?.label ?? card.type ?? "Task"}</span>)}
        {!!card.dependencies?.length && <span title="Dependencies"><Link2 size={12} />{card.dependencies.length}</span>}
        {selection.enabled && !!card.comments?.length && <span title={`${card.comments.length} comments`}><MessageSquare size={12} />{card.comments.length}</span>}
        {card.model && <span className="agora-model" title={`Model: ${card.model}`}>{card.model}</span>}
        {selection.enabled && card.prUrl && <a className="agora-card-pr" href={card.prUrl} target="_blank" rel="noreferrer" title="Open pull request"><GitPullRequest size={12} />#{card.prUrl.split("/").filter(Boolean).at(-1)}</a>}
        <span className="agora-card-flags">
          <button className="agora-flag" data-active={card.needsHumanReview} aria-label={`Toggle human review for ${card.title}`} aria-pressed={!!card.needsHumanReview} onClick={() => onAction({ type: "edit", id: card.id, draft: { ...card, needsHumanReview: !card.needsHumanReview } })}><UserCheck size={13} /></button>
          <button className="agora-flag" data-active={card.automerge} aria-label={`Toggle automatic merge for ${card.title}`} aria-pressed={!!card.automerge} onClick={() => onAction({ type: "edit", id: card.id, draft: { ...card, automerge: !card.automerge } })}><GitMerge size={13} /></button>
          {display.assignee && card.assignee && <span className="agora-avatar" title={workflow.people.find(person => person.id === card.assignee)?.label ?? card.assignee}>{card.assignee.slice(0, 2).toUpperCase()}</span>}
        </span>
      </div>}
      {showActions && <div className="agora-card-foot">
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
      </div>}
    </article>
  )
}

function Column({
  id,
  label,
  cards: incomingCards,
  onNew,
  onEdit,
  onAction,
  workspace = false,
  fullCardLimit = -1,
  sort = "manual",
  onSortChange,
  collapsedIds = [],
  onToggleCollapsed,
  onQuickAdd,
}: {
  workspace?: boolean
  fullCardLimit?: number
  sort?: ColumnSort
  onSortChange?: (sort: ColumnSort) => void
  collapsedIds?: string[]
  onToggleCollapsed?: (id: string) => void
  onQuickAdd?: (title: string) => Promise<void>
  id: ColumnId
  label: string
  cards: BoardCard[]
  onNew: () => void
  onEdit: (card: BoardCard) => void
  onAction: (action: BoardAction) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${id}` })
  const [localCollapsed, setCollapsed] = useState<Set<string>>(new Set())
  const collapsed = workspace ? new Set(collapsedIds) : localCollapsed
  const toggleCollapsed = (id: string) => {
    if (workspace) { onToggleCollapsed?.(id); return }
    setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  const [fullSizeOverride, setFullSizeOverride] = useState<number | null>(null)
  const [assignee, setAssignee] = useState("")
  const { workflow } = useContext(WorkflowContext)
  const cards = sortCards(incomingCards.filter(card => !assignee || card.assignee === assignee), sort)
  const fullLimit = fullSizeOverride === fullCardLimit || fullCardLimit < 0 ? Infinity : fullCardLimit
  const childrenOf = (parentId: string) => cards.filter(card => card.parentId === parentId)
  const rows: { card: BoardCard; depth: number; compact: boolean }[] = []
  const append = (card: BoardCard, depth: number, compact: boolean) => {
    rows.push({ card, depth, compact })
    if (!compact && !collapsed.has(card.id)) childrenOf(card.id).forEach(child => append(child, depth + 1, compact))
  }
  const roots = cards.filter(card => !cards.some(parent => parent.id === card.parentId))
  roots.forEach((card, index) => append(card, 0, index >= fullLimit))
  const firstCompact = rows.findIndex(row => row.compact)
  return (
    <section
      ref={setNodeRef}
      className="agora-column"
      data-column={id}
      data-over={isOver}
      aria-label={`${label} column`}
    >
      <div className="agora-column-head">
        {workspace ? <BoardMenu align="start" className="agora-column-menu" label={<><span className="agora-badge" data-tone={id}>{label}</span><span className="agora-count">{cards.length}</span></>}>
          <label className="agora-menu-field">Sort {label}<BoardSelect aria-label={`Sort ${label}`} value={sort} onValueChange={value => onSortChange?.(value as ColumnSort)} options={SORT_OPTIONS} /></label>
          <label className="agora-menu-field">Assignee<BoardSelect aria-label={`Assignee in ${label}`} value={assignee} onValueChange={setAssignee} options={[{ value: "", label: "Everyone" }, ...workflow.people.map(person => ({ value: person.id, label: person.label }))]} /></label>
        </BoardMenu> : <h3>
          <span className="agora-badge" data-tone={id}>{label}</span>
          <span className="agora-count" aria-label={`${cards.length} cards`}>{cards.length}</span>
        </h3>}
        <button
          className="agora-icon"
          type="button"
          aria-label={`Add card to ${label}`}
          onClick={onNew}
        >
          <Plus />
        </button>
      </div>
      <SortableContext items={rows.map(({ card }) => card.id)} strategy={verticalListSortingStrategy}>
        <div className="agora-cards">
          {rows.map(({ card, depth, compact }, rowIndex) => (
            <div key={card.id} className={depth ? "agora-nested-card" : undefined} style={depth ? { marginLeft: Math.min(depth, 3) * 12 } : undefined}>
              {workspace && rowIndex === firstCompact && <div className="agora-compact-divider"><span />{roots.length - Math.min(roots.length, fullLimit)} cards (<button onClick={() => setFullSizeOverride(fullCardLimit)}>show full size</button>)<span /></div>}
              <SortableCard
                compact={compact}
                showActions={!workspace}
                childCount={workspace ? childrenOf(card.id).length : 0}
                expanded={!collapsed.has(card.id)}
                onToggleChildren={() => toggleCollapsed(card.id)}
                card={card}
                index={cards.indexOf(card)}
                count={cards.length}
                onEdit={() => onEdit(card)}
                onAction={onAction}
              />
              {!workspace && childrenOf(card.id).length > 0 && <button className="agora-children-toggle" aria-expanded={!collapsed.has(card.id)} onClick={() => toggleCollapsed(card.id)}><ChevronRight size={12} style={{ transform: collapsed.has(card.id) ? undefined : "rotate(90deg)" }} />{childrenOf(card.id).length} subtasks</button>}
            </div>
          ))}
        </div>
      </SortableContext>
      {cards.length === 0 && (
        <div className="agora-empty">No cards yet. Add one or drop it here.</div>
      )}
      {workspace && onQuickAdd && <QuickAdd onAdd={onQuickAdd} />}
    </section>
  )
}

function EdgeDestination({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `edge:${id}` })
  return <div ref={setNodeRef} className="agora-edge-destination" data-destination={id} data-over={isOver}><strong>{label}</strong><span>Drop to move</span></div>
}

type Editor = { card?: BoardCard; column: ColumnId; revision?: number; newId?: string }
export function Board({ store: providedStore, mode = "local", workflow: providedWorkflow = DEFAULT_WORKFLOW, workspace = false, workspaceNav, workspaceActions }: { workspaceNav?: ReactNode; workspaceActions?: ReactNode; store?: BoardController; mode?: "local" | "shared"; workflow?: Workflow; workspace?: boolean }) {
  const [store] = useState<BoardController>(() => providedStore ?? (mode === "shared" ? new RemoteBoardStore() : makeStore()))
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  useEffect(() => store.connect(), [store])
  const [editor, setEditor] = useState<Editor | null>(null)
  const [preferences, setPreferences] = useBoardPreferences(workspace ? "agora.test-dashboard.view.v2" : "agora.board.view.v1")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [legacyView, setLegacyView] = useState<"board" | "focus" | "graph">("board")
  const view = workspace ? preferences.view : legacyView
  const setView = (view: "board" | "focus" | "graph") => {
    setSelectedIds(new Set())
    if (workspace) setPreferences({ view }); else setLegacyView(view)
  }
  useEffect(() => {
    if (!workspace || !selectedIds.size || editor) return
    const clear = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedIds(new Set()) }
    window.addEventListener("keydown", clear)
    return () => window.removeEventListener("keydown", clear)
  }, [workspace, selectedIds.size, editor])
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [columnFilter, setColumnFilter] = useState("")
  const [sort, setSort] = useState("manual")
  const [description, setDescription] = useState(true)
  const [metadata, setMetadata] = useState(true)
  const [compact, setCompact] = useState(false)
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
  const visibleTypes = preferences.types ?? workflow.types.map(type => type.id)
  const visibleColumnIds = preferences.columns ?? workflow.columns.filter(column => ["todo", "doing", "review"].includes(column.role)).map(column => column.id)
  const shownColumns = columns.filter(column => workspace ? visibleColumnIds.includes(column.id) : !columnFilter || column.id === columnFilter)
  const epicIds = board.cards.filter(card => !card.archived && board.cards.some(child => !child.archived && child.parentId === card.id)).map(card => card.id)
  const allCollapsed = epicIds.length > 0 && epicIds.every(id => preferences.collapsed.includes(id))
  const inScope = (card: BoardCard): boolean => {
    if (!workspace || !preferences.scope) return true
    let current: BoardCard | undefined = card
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      if (current.id === preferences.scope) return true
      visited.add(current.id)
      current = board.cards.find(parent => parent.id === current?.parentId)
    }
    return false
  }
  const visibleCards = board.cards.filter(card => !card.archived && inScope(card) && (workspace ? visibleTypes.includes(card.type ?? "task") : (!typeFilter || (card.type ?? "task") === typeFilter) && (!columnFilter || card.column === columnFilter)) && `${card.title} ${card.description} ${card.assignee ?? ""}`.toLowerCase().includes(search.toLowerCase()))
  if (sort === "priority") visibleCards.sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1))
  if (sort === "newest") visibleCards.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const initialColumn = workflow.columns.find((column) => column.role === (workspace ? "todo" : "backlog"))?.id ?? workflow.columns[0].id
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
  const selectedCards = board.cards.filter(card => !card.archived && selectedIds.has(card.id))
  const bulkCommand = async (command: BulkCommand) => {
    if (bulkBusy) return
    setBulkBusy(true)
    try {
      const latest = store.getSnapshot().board
      const targets = latest.cards.filter(card => !card.archived && selectedIds.has(card.id))
      let next = latest
      for (const card of targets) {
        const action: BoardAction = command.type === "archive" ? { type: "archive", id: card.id }
          : command.type === "move" ? { type: "move", id: card.id, column: command.column, position: Number.MAX_SAFE_INTEGER }
          : { type: "edit", id: card.id, draft: { ...card, ...command.patch } }
        next = updateBoard(next, action)
      }
      await store.replace(JSON.stringify(next))
      setMessage(`Updated ${targets.length} selected cards.`)
      if (command.type === "archive") setSelectedIds(new Set())
    } catch (cause) { setMessage(`Could not update selected cards. ${cause instanceof Error ? cause.message : "Try again."}`) }
    finally { setBulkBusy(false) }
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
    lastDragEndAt = Date.now()
    setActiveId(null)
    setSort("manual")
    if (!over || dragged.id === over.id) return
    const target = board.cards.find((card) => card.id === over.id)
    const columnId = target?.column ?? String(over.id).replace(/^(column|edge):/, "")
    if (!isColumn(columnId) || !columns.some(column => column.id === columnId)) return
    if (workspace) setPreferences({ sortByColumn: { ...preferences.sortByColumn, [columnId]: "manual" } })
    const destination = board.cards.filter((card) => card.column === columnId && !card.archived)
    const position = target
      ? destination.findIndex((card) => card.id === target.id)
      : destination.length
    mutate({ type: "move", id: String(dragged.id), column: columnId, position })
  }
  return (
    <WorkflowContext.Provider value={{ workflow, columns }}><SelectionContext.Provider value={{ enabled: workspace, selected: selectedIds, toggle: id => setSelectedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next }) }}><DisplayContext.Provider value={workspace ? { description: preferences.properties.includes("description"), metadata: preferences.properties.includes("metadata"), compact: preferences.fullCardLimit === 0, priority: preferences.properties.includes("priority"), type: preferences.properties.includes("type"), assignee: preferences.properties.includes("assignee") } : { description, metadata, compact, priority: true, type: true, assignee: true }}><div className={`agora-board${workspace ? " agora-workspace" : ""}`} aria-label="Agora board">
      {!workspace && <div className="agora-toolbar">
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
      </div>}
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
      {ready && !readOnly && !workspace && <div className="agora-controls">
        <div className="agora-view-switch" role="group" aria-label="Board view">
          <button className="agora-btn" aria-pressed={view === "board"} onClick={() => setView("board")}><LayoutGrid size={14} />Board</button>
          <button className="agora-btn" aria-pressed={view === "focus"} onClick={() => setView("focus")}><Target size={14} />Focus</button>
          <button className="agora-btn" aria-pressed={view === "graph"} onClick={() => setView("graph")}>Graph</button>
        </div>
        <span className="agora-save-state"><i />{mode === "shared" ? "Live" : "Local"}</span>
        <label className="agora-search"><Search size={14} /><input aria-label="Search cards" placeholder="Search cards…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <details className="agora-property-menu"><summary className="agora-btn">Properties</summary><div>
          <label><input type="checkbox" checked={description} onChange={event => setDescription(event.target.checked)} />Description</label>
          <label><input type="checkbox" checked={metadata} onChange={event => setMetadata(event.target.checked)} />Info bar</label>
          <label><input type="checkbox" checked={compact} onChange={event => setCompact(event.target.checked)} />Titles only</label>
        </div></details>
        <select className="agora-btn" aria-label="Filter by type" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">All types</option>{workflow.types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select>
        <select className="agora-btn" aria-label="Filter by column" value={columnFilter} onChange={event => setColumnFilter(event.target.value)}><option value="">All columns</option>{columns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}</select>
        <select className="agora-btn" aria-label="Sort cards" value={sort} onChange={event => setSort(event.target.value)}><option value="manual">Manual order</option><option value="priority">Priority</option><option value="newest">Newest first</option></select>
      </div>}
      {ready && !readOnly && workspace && <div className="agora-controls agora-workspace-controls">
        {workspaceNav}
        <button className="agora-btn agora-new-task" disabled={pending} onClick={() => setEditor({ column: initialColumn, revision: snapshot.revision, newId: crypto.randomUUID() })}><Plus size={14} />New task</button>
        <div className="agora-view-switch" role="group" aria-label="Cards view">
          <button className="agora-btn" aria-pressed={view === "board"} onClick={() => setView("board")}><LayoutGrid size={14} />Board</button>
          <button className="agora-btn" aria-pressed={view === "focus"} onClick={() => setView("focus")}><Target size={14} />Focus</button>
        </div>
        {view === "board" && board.cards.some(card => card.parentId && !card.archived) && <button className="agora-btn" onClick={() => setPreferences({ collapsed: allCollapsed ? [] : epicIds })}>{allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}{allCollapsed ? "Expand all" : "Collapse all"}</button>}
        <span className="agora-save-state" title={unsaved ? "Changes stay in this tab" : "Test board saved in this browser"}><i />{unsaved ? "Unsaved" : "Local"}</span>
        <div className="agora-controls-right">
          <BoardMenu label={preferences.scope ? "Epic scope" : "Scope"} icon={<Target size={14} />}><label className="agora-menu-field">Epic<BoardSelect aria-label="Scope to epic" value={preferences.scope ?? ""} onValueChange={value => setPreferences({ scope: value || null, collapsed: [] })} options={[{ value: "", label: "All work" }, ...board.cards.filter(card => card.type === "epic" && !card.archived).map(card => ({ value: card.id, label: card.title }))]} /></label></BoardMenu>
          <CheckMenu label={`${preferences.properties.length}/5 properties`} icon={<Eye size={14} />} options={[{id:"description",label:"Description"},{id:"priority",label:"Priority"},{id:"metadata",label:"Info bar"},{id:"type",label:"Type"},{id:"assignee",label:"Assignee"}]} selected={preferences.properties} onChange={properties => setPreferences({ properties: properties as typeof preferences.properties })} />
          <BoardMenu label={preferences.fullCardLimit < 0 ? "All full size" : `Full cards: ${preferences.fullCardLimit}`} icon={<Rows3 size={14} />}>
            {[5,10,15,-1].map(limit => <button className="agora-menu-option" aria-pressed={preferences.fullCardLimit === limit} key={limit} onClick={() => setPreferences({ fullCardLimit: limit })}>{limit < 0 ? "All cards" : `First ${limit} cards`}</button>)}
          </BoardMenu>
          <CheckMenu label={visibleTypes.length === workflow.types.length ? "All types" : `${visibleTypes.length} types`} icon={<Layers size={14} />} options={workflow.types} selected={visibleTypes} onChange={types => setPreferences({ types })} />
          <CheckMenu label={visibleColumnIds.length === columns.length ? "All columns" : `${visibleColumnIds.length} of ${columns.length} columns`} icon={<SlidersHorizontal size={14} />} options={columns} selected={visibleColumnIds} onChange={columns => setPreferences({ columns })} />
          <BoardMenu label={<span className="agora-sr-only">Board actions</span>} icon={<MoreHorizontal size={16} />}>
            <button className="agora-menu-option" onClick={() => setArchiveOpen(!archiveOpen)}><Archive size={14} />Archive ({archived.length})</button>
            <label className="agora-menu-field">Search cards<input aria-label="Search test cards" placeholder="Title, details, assignee…" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <button className="agora-menu-option" onClick={download}><Download size={14} />Export backup</button>
            <button className="agora-menu-option" disabled={pending} onClick={() => file.current?.click()}><Upload size={14} />Import backup</button>
            <button className="agora-menu-option" onClick={() => setView("graph")}><Link2 size={14} />Dependency graph</button>
          </BoardMenu>
        </div>
        {workspaceActions}
      </div>}
      {ready && !readOnly && view === "focus" && (workspace ? <FocusView cards={visibleCards} workflow={workflow} onOpen={card => setEditor({ card, column: card.column, revision: snapshot.revision })} /> : <div className="agora-focus" aria-label="Focus cards">
        {visibleCards.length === 0 && <p className="agora-empty">No matching cards.</p>}
        {visibleCards.map(card => <button className="agora-focus-row" key={card.id} onClick={() => setEditor({ card, column: card.column, revision: snapshot.revision })}><span className="agora-badge" data-tone={card.column}>{columns.find(column => column.id === card.column)?.label}</span><span>{card.title}</span><span className="agora-focus-assignee">{card.assignee}</span></button>)}
      </div>)}
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
            onDragCancel={() => { lastDragEndAt = Date.now(); setActiveId(null) }}
            onDragEnd={dragEnd}
          >
            <div
              className="agora-scroll"
              tabIndex={0}
              role="region"
              aria-label="Board columns; scroll horizontally to see all columns"
            >
              <div className="agora-columns" style={{ gridTemplateColumns: `repeat(${shownColumns.length}, 18rem)`, minWidth: `calc(${shownColumns.length} * (18rem + 1rem))` }}>
                {shownColumns.map((column) => (
                  <Column
                    key={column.id}
                    {...column}
                    workspace={workspace}
                    onQuickAdd={async title => {
                      await store.dispatch({ type: "create", id: crypto.randomUUID(), draft: { title, description: "", column: column.id, type: "task", priority: 1, parentId: preferences.scope } })
                    }}
                    fullCardLimit={workspace ? preferences.fullCardLimit : -1}
                    sort={workspace ? preferences.sortByColumn[column.id] ?? "priority-desc" : "manual"}
                    onSortChange={sort => setPreferences({ sortByColumn: { ...preferences.sortByColumn, [column.id]: sort } })}
                    collapsedIds={preferences.collapsed}
                    onToggleCollapsed={id => setPreferences({ collapsed: preferences.collapsed.includes(id) ? preferences.collapsed.filter(item => item !== id) : [...preferences.collapsed, id] })}
                    cards={visibleCards.filter(
                      (card) => card.column === column.id,
                    )}
                    onNew={() => setEditor({ column: column.id, revision: snapshot.revision, newId: crypto.randomUUID() })}
                    onEdit={(card) => setEditor({ card, column: card.column, revision: snapshot.revision })}
                    onAction={mutate}
                  />
                ))}
              </div>
            </div>
            {workspace && activeId && <div className="agora-edge-destinations">{columns.filter(column => ["backlog", "done", "wont-do"].includes(column.id)).map(column => <EdgeDestination key={column.id} {...column} />)}</div>}
            <DragOverlay zIndex={90}>
              {active ? <div className={`agora-card${workspace ? " agora-card-preview" : ""}`}>
                <div className="agora-card-top"><span className="agora-card-title">{active.title}</span><PriorityStar priority={active.priority} size={14} /></div>
                {(!workspace || preferences.properties.includes("description")) && active.description && <p className="agora-card-description">{active.description}</p>}
                <div className="agora-card-meta"><span className="agora-badge">{workflow.types.find(type => type.id === active.type)?.label ?? "Task"}</span>{active.model && <span>{active.model}</span>}{active.assignee && <span>{workflow.people.find(person => person.id === active.assignee)?.label ?? active.assignee}</span>}</div>
              </div> : null}
            </DragOverlay>
          </DndContext>
          {workspace && shownColumns.length === 0 && <p className="agora-empty">No columns selected. Choose columns in the toolbar to show your tasks.</p>}
          <p className="agora-help">
            Drag cards to move them. Click a title to rename, or the card to open details.{workspace ? " ⌘ / Ctrl / Shift-click to select cards. Esc clears selection." : " Use the handle for keyboard dragging."}
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
      {workspace && <BulkActions count={selectedCards.length} workflow={workflow} busy={bulkBusy} onCommand={command => void bulkCommand(command)} onClear={() => setSelectedIds(new Set())} />}
      {editor && workspace && <WorkspaceEditor key={editor.card?.id ?? editor.newId} {...editor} board={board} store={store} workflow={workflow} onClose={() => setEditor(null)} onOpenCard={card => setEditor({ card, column: card.column })} />}
      {editor && !workspace && (
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
    </div></DisplayContext.Provider></SelectionContext.Provider></WorkflowContext.Provider>
  )
}
