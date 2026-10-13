"use client"

import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from "react"
import * as Popover from "@radix-ui/react-popover"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowUpRight, ChevronLeft, ChevronRight, GitPullRequest, GripVertical, Search, SquareKanban } from "lucide-react"
import type { BoardCard, CardDraft } from "../../lib/board"
import { TYPE_LEVELS, typeLevel, type Workflow } from "../../lib/workflow"
import { CoverField, LogoTile } from "./cover-field"
import { AssigneeMenu } from "./view-controls"
import { addMonths, dueLabel, dueSortKey, finished, monthLabel, monthWindow, overdue, projectGroups, projectNodes, timelinePosition, timelineSpan, TIMELINE_SPANS, type TimelineSpan } from "../../lib/board-view"

const PRIORITY = ["Low", "Medium", "High"]
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso))
const todayIso = () => new Date().toISOString().slice(0, 10)
// Plain code-point order: localeCompare would rank the "~" of undated work before digits.
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const byDue = (a: BoardCard, b: BoardCard) => compare(dueSortKey(a), dueSortKey(b)) || a.title.localeCompare(b.title)
type Scope = "upcoming" | "past" | "all"
/* The months share the width left beside the names. Below this much room
   each, the timeline scrolls sideways instead, with the names pinned. */
const MIN_MONTH_WIDTH = 64
/* How far the arrows page for each span: a month at a time up close, a
   quarter or half-year at a time when zoomed out. */
const PAGE_STEP: Record<TimelineSpan, number> = { 1: 1, 3: 1, 6: 3, 12: 6 }
/* In the one-month view, a mark every week keeps days readable. */
const weekTicks = (months: string[]) => months.length === 1 ? [8, 15, 22, 29].filter(day => day <= new Date(Date.UTC(Number(months[0].slice(0, 4)), Number(months[0].slice(5)), 0)).getUTCDate()).map(day => ({ day, left: timelinePosition(`${months[0]}-${String(day).padStart(2, "0")}`, months) * 100 })) : []
/* The name column can be dragged between these widths; double-click resets it. */
export const LABEL_WIDTH = { min: 280, max: 720, initial: 460 }
const clampWidth = (width: number) => Math.round(Math.min(LABEL_WIDTH.max, Math.max(LABEL_WIDTH.min, width)))
type Section = { key: string; label: string; project?: BoardCard; cards: BoardCard[] }
type Update = (card: BoardCard, patch: Partial<CardDraft>) => void
type Href = ((card: BoardCard) => string) | undefined
/* What a timeline marker does when clicked: a link to the card on the board
   where pages have URLs, otherwise a callback that shows it there in place. */
export type MarkerTarget = { href?: (card: BoardCard) => string | undefined; onPick: (card: BoardCard) => void }

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (value: T) => void }) {
  return <div className="agora-view-switch" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} className="agora-btn" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.icon}{option.label}</button>)}
  </div>
}

/* Linkify bare URLs in a description, so a source page reads as a link. */
function Linked({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s)]+)/g).map((part, index) => index % 2
    ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}</a>
    : <Fragment key={index}>{part}</Fragment>)}</>
}

/* A month-by-month track. A dated card is a dot on its day, a card with only
   a target month is a dashed span across that month, and undated work is a
   faint line over the stretch it has been active. The compact form shows a
   whole group on one line so a folded project still says where it lands. */
function Track({ cards, months, workflow, compact = false, marker }: { cards: BoardCard[]; months: string[]; workflow: Workflow; compact?: boolean; marker?: MarkerTarget }) {
  const today = todayIso()
  const role = (card: BoardCard) => workflow.columns.find(column => column.id === card.column)?.role ?? "todo"
  // Each marker is the way to its card: hovering shows the card, clicking goes
  // to it on the board. They stay out of the tab order; the rows cover that.
  const mark = (card: BoardCard, className: string, style: CSSProperties, children?: ReactNode, late = false) => {
    const href = marker?.href?.(card)
    const shared = { className, style, tabIndex: -1, "data-role": role(card), "data-tip-card": card.id, "data-overdue": late || undefined, "aria-label": `${card.title}: show on the board` }
    return href
      ? <a key={card.id} {...shared} href={href}>{children}</a>
      : <button key={card.id} {...shared} type="button" onClick={() => marker?.onPick(card)}>{children}</button>
  }
  return <div className="agora-timeline-track" data-compact={compact || undefined}>
    <div className="agora-timeline-grid" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }} aria-hidden="true">{months.map(month => <i key={month} />)}</div>
    {weekTicks(months).map(tick => <i key={tick.day} className="agora-timeline-tick" style={{ left: `${tick.left}%` }} aria-hidden="true" />)}
    {months.includes(today.slice(0, 7)) && <i className="agora-timeline-today" style={{ left: `${timelinePosition(today, months) * 100}%` }} aria-hidden="true" />}
    {cards.map(card => {
      if (card.dueDate?.length === 7) {
        const index = months.indexOf(card.dueDate)
        if (index < 0) return null
        return mark(card, "agora-timeline-month", { left: `calc(${(index / months.length) * 100}% + 6px)`, width: `calc(${100 / months.length}% - 12px)` })
      }
      if (card.dueDate) {
        // A target outside the window is off the page, not parked at its edge.
        if (!months.includes(card.dueDate.slice(0, 7))) return null
        return mark(card, "agora-timeline-point", { left: `${timelinePosition(card.dueDate, months) * 100}%` }, <><i />{!compact && <small>{dayLabel(`${card.dueDate}T12:00:00Z`)}</small>}</>, overdue(card, workflow, today))
      }
      const active = timelineSpan(card, months)
      if (!active) return null
      return mark(card, "agora-timeline-bar", { left: `${active.start * 100}%`, width: `calc(${(active.end - active.start) * 100}% + 6px)` })
    })}
  </div>
}

/* The card a marker stands for, shown beside it on hover. */
function HoverCard({ card, workflow, x, y }: { card: BoardCard; workflow: Workflow; x: number; y: number }) {
  const type = workflow.types.find(type => type.id === card.type)?.label ?? card.type ?? "Task"
  const owner = workflow.people.find(person => person.id === card.assignee)?.label ?? card.assignee
  const late = overdue(card, workflow, todayIso())
  const when = dueLabel(card) ?? `No target date · active ${dayLabel(card.createdAt)} → ${dayLabel(card.updatedAt)}`
  return <div className="agora-timeline-tip" role="tooltip" style={{ left: x, top: y }}>
    <strong>{card.title}</strong>
    {card.description && <p>{card.description}</p>}
    <span className="agora-timeline-tip-meta">
      <span className="agora-badge" data-tone={card.type ?? "task"}>{type}</span>
      <span className="agora-badge" data-tone={card.column}>{workflow.columns.find(column => column.id === card.column)?.label ?? card.column}</span>
      {owner && <span className="agora-avatar" title={owner}>{card.assignee!.slice(0, 2).toUpperCase()}</span>}
    </span>
    <small data-overdue={late || undefined}>{late ? "Overdue · " : ""}{when}</small>
    <em>{typeLevel(workflow, card.type) === TYPE_LEVELS.project ? "Click to open the project" : "Click to show it on the board"}</em>
  </div>
}

function Details({ card, workflow, onOpen, projectHref }: { card: BoardCard; workflow: Workflow; onOpen: (card: BoardCard) => void; projectHref: Href }) {
  const type = workflow.types.find(type => type.id === card.type)?.label ?? card.type ?? "Task"
  const column = workflow.columns.find(column => column.id === card.column)?.label ?? card.column
  const owner = workflow.people.find(person => person.id === card.assignee)?.label ?? card.assignee
  return <div className="agora-timeline-details">
    <dl>
      <dt>When</dt><dd>{dueLabel(card) ?? "No target date"}</dd>
      <dt>Status</dt><dd>{column}</dd>
      <dt>Owner</dt><dd>{owner ?? "Unassigned"}</dd>
      <dt>Priority</dt><dd>{PRIORITY[(card.priority ?? 1) - 1]}</dd>
      <dt>Active</dt><dd>{dayLabel(card.createdAt)} → {dayLabel(card.updatedAt)}</dd>
    </dl>
    <div>
      {card.description ? <p><Linked text={card.description} /></p> : <p className="agora-timeline-muted">No description yet.</p>}
      <div className="agora-timeline-links">
        <button className="agora-timeline-open" onClick={() => onOpen(card)}>Open {type.toLowerCase()} <ArrowUpRight size={13} aria-hidden="true" /></button>
        {projectHref && typeLevel(workflow, card.type) > TYPE_LEVELS.task && <a className="agora-timeline-open" href={projectHref(card)}><SquareKanban size={13} aria-hidden="true" />View {type.toLowerCase()} board</a>}
        {card.prUrl && <a className="agora-timeline-open" href={card.prUrl} target="_blank" rel="noopener noreferrer"><GitPullRequest size={13} aria-hidden="true" />Pull request</a>}
      </div>
    </div>
  </div>
}

type RowContext = { months: string[]; workflow: Workflow; projectHref: Href; marker?: MarkerTarget; onUpdate: Update; projectImage?: string | null; expanded: string[]; toggle: (key: string) => void; openId: string | null; setOpenId: (id: string | null) => void; onOpen: (card: BoardCard) => void }
/* A sub-project (epic) or task row. Sub-projects show their own logo when it
   differs from the project's and fold their subtasks away until expanded;
   tasks sit one step further in. Clicking a row shows its details. */
function Row({ card, depth, tasks, context }: { card: BoardCard; depth: 1 | 2; tasks: BoardCard[]; context: RowContext }) {
  const { months, workflow, projectHref, marker, onUpdate, projectImage, expanded, toggle, openId, setOpenId, onOpen } = context
  const open = openId === card.id
  const parent = depth === 1 && typeLevel(workflow, card.type) > TYPE_LEVELS.task
  const unfolded = expanded.includes(card.id)
  const column = workflow.columns.find(column => column.id === card.column)?.label
  const when = dueLabel(card)
  const late = overdue(card, workflow, todayIso())
  return <Fragment>
    <div className="agora-timeline-row" data-depth={depth} data-open={open || undefined}>
      <div className="agora-timeline-label">
        {tasks.length
          ? <button className="agora-timeline-fold" aria-expanded={unfolded} aria-label={`${unfolded ? "Collapse" : "Expand"} ${card.title}`} onClick={() => toggle(card.id)}><ChevronRight size={14} aria-hidden="true" /></button>
          : <i className="agora-timeline-fold" aria-hidden="true" />}
        <button className="agora-timeline-item" aria-expanded={open} onClick={() => setOpenId(open ? null : card.id)}>
          {parent && (card.imageUrl && card.imageUrl !== projectImage ? <LogoTile src={card.imageUrl} /> : <span className="agora-logo-tile" data-blank aria-hidden="true" />)}
          <span className="agora-timeline-title">
            <span><i className="agora-priority-dot" data-priority={card.priority ?? 1} title={`${PRIORITY[(card.priority ?? 1) - 1]} priority`} />{card.title}</span>
            {card.description && <small className="agora-timeline-subtitle">{card.description}</small>}
            <small data-overdue={late || undefined}>{[when ? `${late ? "Overdue · " : ""}${when}` : "No target date", tasks.length ? `${tasks.length} ${tasks.length === 1 ? "subtask" : "subtasks"}` : null].filter(Boolean).join(" · ")}</small>
          </span>
          <span className="agora-badge" data-tone={card.column}>{column}</span>
        </button>
        <AssigneeMenu people={workflow.people} value={card.assignee} cardTitle={card.title} onChange={assignee => onUpdate(card, { assignee })} />
      </div>
      <Track cards={tasks.length && !unfolded ? [card, ...tasks] : [card]} months={months} workflow={workflow} compact={tasks.length > 0 && !unfolded} marker={marker} />
    </div>
    {open && <Details card={card} workflow={workflow} onOpen={onOpen} projectHref={projectHref} />}
    {unfolded && tasks.map(child => <Row key={child.id} card={child} depth={2} tasks={[]} context={context} />)}
  </Fragment>
}

/* The project's cover doubles as the way to change it: upload, link, set a
   dark tile, or remove, without opening the project card. */
function CoverButton({ project, onUpdate }: { project: BoardCard; onUpdate: Update }) {
  return <Popover.Root>
    <Popover.Trigger asChild>
      <button className="agora-cover-button" aria-label={`Change cover for ${project.title}`} title="Change cover"><LogoTile src={project.imageUrl} fallback /></button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="agora-menu agora-cover-menu" align="start" sideOffset={6}>
        <p className="agora-cover-heading">Cover for {project.title}</p>
        <CoverField id={`cover-${project.id}`} value={project.imageUrl} onChange={imageUrl => onUpdate(project, { imageUrl })} />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
}

/* One project's group: its large row, then its sub-projects and tasks. The
   grip reorders projects by drag and drop, or from the keyboard. */
function ProjectSection({ section, sortable, closed, onToggle, context, onUpdate }: { section: Section; sortable: boolean; closed: boolean; onToggle: () => void; context: RowContext; onUpdate: Update }) {
  const { months, workflow, projectHref, marker, onOpen } = context
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: section.key, disabled: !sortable })
  const nodes = projectNodes(section.cards, workflow)
  const subProjects = section.cards.filter(card => typeLevel(workflow, card.type) > TYPE_LEVELS.task).length
  const tasks = section.cards.length - subProjects
  const next = section.cards.find(card => card.dueDate && !finished(card, workflow))
  return <section ref={setNodeRef} className="agora-timeline-group" data-dragging={isDragging || undefined} style={{ transform: CSS.Translate.toString(transform), transition }}>
    <div className="agora-timeline-row agora-timeline-project">
      <div className="agora-timeline-label">
        {sortable && <button ref={setActivatorNodeRef} className="agora-timeline-grip" aria-label={`Reorder ${section.label}`} title="Drag to reorder" {...attributes} {...listeners}><GripVertical size={14} aria-hidden="true" /></button>}
        <button className="agora-timeline-fold" aria-expanded={!closed} aria-label={`${closed ? "Expand" : "Collapse"} ${section.label}`} onClick={onToggle}><ChevronRight size={14} aria-hidden="true" /></button>
        {section.project ? <CoverButton project={section.project} onUpdate={onUpdate} /> : <LogoTile fallback />}
        <span className="agora-timeline-project-text">
          <span className="agora-timeline-project-name">
            <h3>
              {section.project
                ? <button className="agora-focus-project" onClick={() => onOpen(section.project!)}>{section.label}</button>
                : <span>{section.label}</span>}
            </h3>
            {section.project && projectHref && <a className="agora-view-project" href={projectHref(section.project)} aria-label={`View project ${section.label}`} title="View project"><SquareKanban size={16} aria-hidden="true" /></a>}
          </span>
          {section.project?.description && <small className="agora-timeline-subtitle">{section.project.description}</small>}
          <span className="agora-timeline-project-meta">
            {section.project && <span className="agora-badge" data-tone={section.project.column}>{workflow.columns.find(column => column.id === section.project!.column)?.label}</span>}
            {section.project && <AssigneeMenu people={workflow.people} value={section.project.assignee} cardTitle={section.project.title} onChange={assignee => onUpdate(section.project!, { assignee })} />}
            <small>{[
              subProjects ? `${subProjects} ${subProjects === 1 ? "sub-project" : "sub-projects"}` : null,
              tasks ? `${tasks} ${tasks === 1 ? "task" : "tasks"}` : null,
              next ? `next ${dueLabel(next)}` : null,
            ].filter(Boolean).join(" · ") || "Nothing planned yet"}</small>
          </span>
        </span>
      </div>
      <Track cards={nodes.length ? nodes.map(node => node.card) : section.project ? [section.project] : []} months={months} workflow={workflow} compact marker={marker} />
    </div>
    {!closed && section.cards.length === 0 && <p className="agora-timeline-muted agora-timeline-empty">Nothing broken out yet.</p>}
    {!closed && nodes.map(node => <Row key={node.card.id} card={node.card} depth={1} tasks={node.children} context={{ ...context, projectImage: section.project?.imageUrl }} />)}
  </section>
}

/* Timeline: one large row per project. Projects keep the order they are
   dragged into (otherwise earliest target first); expanding one shows its
   sub-projects (epics) and direct tasks, and expanding a sub-project shows its
   subtasks. The name column's right edge drags to resize it. */
function Timeline({ sections, months, workflow, onOpen, onUpdate, projectHref, marker, onReorder, labelWidth, onResize }: { sections: Section[]; months: string[]; workflow: Workflow; onOpen: (card: BoardCard) => void; onUpdate: Update; projectHref: Href; marker?: MarkerTarget; onReorder?: (keys: string[]) => void; labelWidth?: number | null; onResize?: (width: number | null) => void }) {
  // Projects start open and sub-projects start folded, so the first view is
  // projects and their sub-projects, with tasks one click away.
  const [folded, setFolded] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  // Hovering a marker shows the card behind it, at once and above the marker.
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null)
  const showTip = (target: EventTarget) => {
    const hovered = (target as HTMLElement).closest<HTMLElement>("[data-tip-card]")
    if (!hovered) { setTip(null); return }
    const box = hovered.getBoundingClientRect()
    const x = box.left + box.width / 2
    setTip({ id: hovered.dataset.tipCard ?? "", x: Math.min(Math.max(x, 160), Math.max(160, window.innerWidth - 160)), y: box.top })
  }
  const tipCard = tip ? sections.flatMap(section => section.project ? [section.project, ...section.cards] : section.cards).find(card => card.id === tip.id) : undefined
  const drag = useRef<{ x: number; width: number } | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const today = todayIso()
  const flip = (list: string[], key: string) => list.includes(key) ? list.filter(item => item !== key) : [...list, key]
  const width = dragWidth ?? labelWidth ?? LABEL_WIDTH.initial
  const projectKeys = sections.filter(section => section.project).map(section => section.key)
  const sortable = !!onReorder && projectKeys.length > 1
  const reorder = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = projectKeys.indexOf(String(active.id))
    const to = projectKeys.indexOf(String(over.id))
    if (from >= 0 && to >= 0) onReorder?.(arrayMove(projectKeys, from, to))
  }
  const context: RowContext = { months, workflow, projectHref, marker, onUpdate, expanded, toggle: key => setExpanded(flip(expanded, key)), openId, setOpenId, onOpen }
  // The frame does not scroll, so the divider's handle stays on the divider
  // for the table's whole height while the months scroll underneath.
  return <div className="agora-projects-frame" style={{ "--agora-timeline-label": `${width}px` } as CSSProperties} onMouseOver={event => showTip(event.target)} onMouseLeave={() => setTip(null)}>
   <div className="agora-projects" onScroll={() => setTip(null)}>
    <div className="agora-projects-scroll" style={{ minWidth: `calc(var(--agora-timeline-label) + ${months.length * MIN_MONTH_WIDTH}px)` }}>
      <div className="agora-timeline-row agora-timeline-head">
        <div className="agora-timeline-label">
          <span>Project</span>
        </div>
        <div className="agora-timeline-months" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map(month => <span key={month}>{monthLabel(month, months.length === 1 ? "long" : "short")}</span>)}
          {weekTicks(months).map(tick => <em key={tick.day} style={{ left: `${tick.left}%` }}>{tick.day}</em>)}
          {months.includes(today.slice(0, 7)) && <b style={{ left: `${timelinePosition(today, months) * 100}%` }}>Today</b>}
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
        <SortableContext items={projectKeys} strategy={verticalListSortingStrategy}>
          {sections.map(section => <ProjectSection key={section.key} section={section} sortable={sortable && !!section.project} closed={folded.includes(section.key)} onToggle={() => setFolded(flip(folded, section.key))} context={context} onUpdate={onUpdate} />)}
        </SortableContext>
      </DndContext>
    </div>
   </div>
   {tip && tipCard && <HoverCard card={tipCard} workflow={workflow} x={tip.x} y={tip.y} />}
   {onResize && <span
     className="agora-timeline-resize" role="separator" aria-orientation="vertical" aria-label="Resize the project column" tabIndex={0}
     aria-valuemin={LABEL_WIDTH.min} aria-valuemax={LABEL_WIDTH.max} aria-valuenow={width} title="Drag to resize · double-click to reset"
     data-dragging={dragWidth !== null || undefined}
     onPointerDown={event => { drag.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
     onPointerMove={event => { if (drag.current) setDragWidth(clampWidth(drag.current.width + event.clientX - drag.current.x)) }}
     onPointerUp={() => { if (drag.current && dragWidth !== null) onResize(dragWidth); drag.current = null; setDragWidth(null) }}
     onPointerCancel={() => { drag.current = null; setDragWidth(null) }}
     onDoubleClick={() => onResize(null)}
     onKeyDown={event => {
       if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
       event.preventDefault()
       onResize(clampWidth(width + (event.key === "ArrowRight" ? 16 : -16)))
     }}
   />}
  </div>
}

/* Calendar: three months at a time. Days with a target are buttons that
   narrow the month's list to that day; month-only targets stay listed. */
function Calendar({ cards, projectOf, workflow, onOpen }: { cards: BoardCard[]; projectOf: (card: BoardCard) => BoardCard | undefined; workflow: Workflow; onOpen: (card: BoardCard) => void }) {
  const [start, setStart] = useState(() => todayIso().slice(0, 7))
  const [selected, setSelected] = useState<string | null>(null)
  const dated = cards.filter(card => card.dueDate).sort(byDue)
  const undated = cards.length - dated.length
  const months = [0, 1, 2].map(offset => addMonths(start, offset))
  const move = (by: number) => { setStart(addMonths(start, by)); setSelected(null) }
  return <div className="agora-calendar">
    <div className="agora-calendar-nav">
      <button className="agora-btn" aria-label="Earlier months" onClick={() => move(-3)}><ChevronLeft size={14} /></button>
      <span>{monthLabel(months[0], "long")} – {monthLabel(months[2], "long")}</span>
      <button className="agora-btn" aria-label="Later months" onClick={() => move(3)}><ChevronRight size={14} /></button>
      {selected && <button className="agora-btn" onClick={() => setSelected(null)}>Show all</button>}
    </div>
    <div className="agora-calendar-months">
      {months.map(month => {
        const first = new Date(`${month}-01T12:00:00Z`)
        const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
        const inMonth = dated.filter(card => card.dueDate!.startsWith(month))
        const shown = inMonth.filter(card => !selected?.startsWith(month) || card.dueDate === selected || card.dueDate!.length === 7)
        return <section key={month} className="agora-calendar-month">
          <h3>{monthLabel(month, "long")}</h3>
          <div className="agora-calendar-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day} className="agora-calendar-weekday">{day}</span>)}
            {Array.from({ length: first.getUTCDay() }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: days }, (_, index) => {
              const date = `${month}-${String(index + 1).padStart(2, "0")}`
              const onDay = inMonth.filter(card => card.dueDate === date)
              return onDay.length
                ? <button key={date} className="agora-calendar-day" aria-pressed={selected === date} aria-label={`${monthLabel(month, "long")} ${index + 1}: ${onDay.map(card => card.title).join(", ")}`} onClick={() => setSelected(selected === date ? null : date)}>{index + 1}</button>
                : <span key={date} className="agora-calendar-day" data-today={date === todayIso() || undefined}>{index + 1}</span>
            })}
          </div>
          <ul className="agora-calendar-list">
            {shown.map(card => <li key={card.id}>
              <button onClick={() => onOpen(card)}>
                <LogoTile src={card.imageUrl ?? projectOf(card)?.imageUrl} />
                <span className="agora-calendar-text">
                  <strong>{card.title}</strong>
                  <small>{[projectOf(card)?.title, dueLabel(card)].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="agora-badge" data-tone={card.column}>{workflow.columns.find(column => column.id === card.column)?.label}</span>
              </button>
            </li>)}
            {inMonth.length === 0 && <li className="agora-timeline-muted">Nothing planned this month.</li>}
          </ul>
        </section>
      })}
    </div>
    {undated > 0 && <p className="agora-timeline-muted">{undated === 1 ? "1 card has no target date, so it only shows" : `${undated} cards have no target date, so they only show`} on the timeline.</p>}
  </div>
}

/* List: every project card in scope (sub-projects and tasks) as one table,
   sorted by target date and searchable by text. */
function CardList({ cards, projectOf, workflow, onOpen }: { cards: BoardCard[]; projectOf: (card: BoardCard) => BoardCard | undefined; workflow: Workflow; onOpen: (card: BoardCard) => void }) {
  const [query, setQuery] = useState("")
  const [descending, setDescending] = useState(false)
  const needle = query.trim().toLowerCase()
  const rows = cards
    .filter(card => !needle || `${card.title} ${card.description} ${projectOf(card)?.title ?? ""} ${card.assignee ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => descending ? byDue(b, a) : byDue(a, b))
  const today = todayIso()
  return <div className="agora-projects agora-project-list">
    <label className="agora-search"><Search size={14} /><input aria-label="Search project cards" placeholder="Search cards…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="agora-project-list-scroll">
      <table>
        <thead><tr>
          <th>Card</th><th>Type</th><th>Project</th>
          <th><button onClick={() => setDescending(!descending)} aria-label={`Sort by target date, ${descending ? "latest" : "earliest"} first`}>When {descending ? "↓" : "↑"}</button></th>
          <th>Status</th><th>Owner</th><th>Link</th>
        </tr></thead>
        <tbody>{rows.map(card => <tr key={card.id}>
          <td><button className="agora-list-card" onClick={() => onOpen(card)}>
            <LogoTile src={card.imageUrl} />
            <span><strong>{card.title}</strong>{card.description && <small>{card.description}</small>}</span>
          </button></td>
          <td>{workflow.types.find(type => type.id === card.type)?.label ?? card.type ?? "Task"}</td>
          <td>{projectOf(card)?.title ?? <span className="agora-timeline-muted">—</span>}</td>
          <td data-overdue={overdue(card, workflow, today) || undefined}>{dueLabel(card) ?? <span className="agora-timeline-muted">Not set</span>}</td>
          <td><span className="agora-badge" data-tone={card.column}>{workflow.columns.find(column => column.id === card.column)?.label}</span></td>
          <td>{workflow.people.find(person => person.id === card.assignee)?.label ?? card.assignee ?? "—"}</td>
          <td>{card.prUrl ? <a href={card.prUrl} target="_blank" rel="noopener noreferrer"><GitPullRequest size={12} aria-hidden="true" />PR</a> : <span className="agora-timeline-muted">—</span>}</td>
        </tr>)}</tbody>
      </table>
      {rows.length === 0 && <p className="agora-timeline-muted agora-timeline-empty">No cards match.</p>}
    </div>
  </div>
}

/* columns is the toolbar's column selection: cards in other columns stay
   hidden here too. A project whose own card is hidden still heads its group
   while any of its shown work remains. allCards is the whole board, so work
   keeps its project when a filter hides the cards in between. order is the
   hand-sorted project order; projects not in it follow, earliest target first. */
export function ProjectView({ cards, allCards, workflow, onOpen, onUpdate, projectHref, columns, mode = "timeline", order, onReorder, labelWidth, onResize, span = 6, onSpan, marker }: { cards: BoardCard[]; allCards?: BoardCard[]; workflow: Workflow; onOpen: (card: BoardCard) => void; onUpdate: Update; projectHref?: Href; columns?: string[]; mode?: "timeline" | "calendar" | "list"; order?: string[]; onReorder?: (keys: string[]) => void; labelWidth?: number | null; onResize?: (width: number | null) => void; span?: TimelineSpan; onSpan?: (span: TimelineSpan) => void; marker?: MarkerTarget }) {
  // The timeline opens on this month; the arrows page from there.
  const [paged, setPaged] = useState<string | null>(null)
  // The list has no period filter: it shows every card and sorts by date instead.
  const [period, setScope] = useState<Scope>("upcoming")
  const scope: Scope = mode === "list" ? "all" : period
  const { groups, loose } = projectGroups(cards, workflow, allCards)
  const label = mode === "calendar" ? "Project calendar" : mode === "list" ? "Project list" : "Project cards"
  const rank = new Map((order ?? []).map((id, index) => [id, index]))
  if (!groups.length && !loose.length) return <div className="agora-projects-view" aria-label={label}><p className="agora-focus-empty">No projects yet. Use Add card to create a project, then break it into sub-projects and tasks.</p></div>

  // Upcoming is open work and Past is finished work, wherever its date falls,
  // so an overdue card stays in front of you instead of slipping into Past.
  const shown = (card: BoardCard) => !columns || columns.includes(card.column)
  const inScope = (card: BoardCard) => shown(card) && (scope === "all" || (scope === "past") === finished(card, workflow))
  const sections: Section[] = [
    ...groups.map(group => ({ key: group.project.id, label: group.project.title, project: group.project, cards: group.cards.filter(inScope).sort(byDue) }))
      .filter(section => section.cards.length > 0 || inScope(section.project))
      .sort((a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity) || compare(dueSortKey(a.cards[0] ?? a.project), dueSortKey(b.cards[0] ?? b.project))),
    ...[{ key: "__loose__", label: "Not in a project", cards: loose.filter(inScope).sort(byDue) }].filter(section => section.cards.length > 0),
  ]
  const owner = new Map(groups.flatMap(group => group.cards.map(card => [card.id, group.project] as const)))
  const projectOf = (card: BoardCard) => owner.get(card.id)
  const scoped = sections.flatMap(section => section.cards)
  const thisMonth = todayIso().slice(0, 7)
  const months = monthWindow(paged ?? thisMonth, span)

  return <div className="agora-projects-view" aria-label={label}>
    {mode !== "list" && <div className="agora-projects-toolbar">
      <Segmented label="Project period" value={scope} onChange={setScope} options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "all", label: "All" }]} />
      {mode === "timeline" && <div className="agora-timeline-zoom">
        <button className="agora-btn" aria-label="Earlier months" onClick={() => setPaged(addMonths(months[0], -PAGE_STEP[span]))}><ChevronLeft size={14} /></button>
        <span className="agora-timeline-range">{span === 1 ? monthLabel(months[0], "long") : `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`}</span>
        <button className="agora-btn" aria-label="Later months" onClick={() => setPaged(addMonths(months[0], PAGE_STEP[span]))}><ChevronRight size={14} /></button>
        <button className="agora-btn" disabled={months[0] === thisMonth} onClick={() => setPaged(null)}>Today</button>
        {onSpan && <Segmented label="Timeline span" value={String(span)} onChange={value => onSpan(Number(value) as TimelineSpan)} options={TIMELINE_SPANS.map(count => ({ value: String(count), label: count === 1 ? "1 month" : `${count} months` }))} />}
      </div>}
    </div>}
    {sections.length === 0
      ? <p className="agora-focus-empty">{mode === "list" ? "No cards in the selected columns." : `Nothing ${scope === "past" ? "finished" : "open"} here. Switch to Upcoming, Past, or All to see other work.`}</p>
      : mode === "calendar" ? <Calendar cards={scoped} projectOf={projectOf} workflow={workflow} onOpen={onOpen} />
      : mode === "list" ? <CardList cards={scoped} projectOf={projectOf} workflow={workflow} onOpen={onOpen} />
      // Projects hidden by the current filters keep their place after the ones just sorted.
      : <Timeline sections={sections} months={months} workflow={workflow} onOpen={onOpen} onUpdate={onUpdate} projectHref={projectHref} marker={marker} labelWidth={labelWidth} onResize={onResize} onReorder={onReorder ? keys => onReorder([...keys, ...(order ?? []).filter(id => !keys.includes(id))]) : undefined} />}
  </div>
}
