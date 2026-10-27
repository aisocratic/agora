"use client"

import { useEffect, useState, type ReactNode } from "react"
import * as Popover from "@radix-ui/react-popover"
import { ChevronDown, Eye, EyeClosed, EyeOff, FolderKanban, Layers, Plus, SlidersHorizontal, SquareCheck, Target, UserPlus, type LucideIcon } from "lucide-react"
import { TIMELINE_SPANS, type CardProperty, type ColumnSort, type TimelineSpan } from "../../lib/board-view"
import type { Workflow } from "../../lib/workflow"

export function BoardMenu({ label, icon, children, className = "", align = "end" }: { label: ReactNode; icon?: ReactNode; children: ReactNode; className?: string; align?: "start" | "end" }) {
  return <Popover.Root><Popover.Trigger asChild><button type="button" className={`agora-btn ${className}`}>{icon}{label}<ChevronDown size={12} /></button></Popover.Trigger><Popover.Portal><Popover.Content className="agora-menu" align={align} sideOffset={6}>{children}</Popover.Content></Popover.Portal></Popover.Root>
}
export function CheckMenu({ label, icon, options, selected, onChange }: { label: string; icon?: ReactNode; options: {id: string; label: string}[]; selected: string[]; onChange: (next: string[]) => void }) {
  return <BoardMenu label={label} icon={icon}>
    {options.map(option => <label className="agora-menu-check" key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={event => onChange(event.target.checked ? [...selected, option.id] : selected.filter(id => id !== option.id))} />{option.label}</label>)}
    <button className="agora-menu-reset" onClick={() => onChange(options.map(option => option.id))}>Select all</button>
  </BoardMenu>
}
/* How each column is viewed: always on the board, on it only while it holds
   cards, or hidden. The toolbar's Columns menu lists every column with that
   choice as a row of eyes; each column's own menu carries the same three.
   Follows the AI Socratic website's board (columns-control.tsx). */
export type ColumnView = "show" | "auto" | "hide"
const COLUMN_VIEWS: { value: ColumnView; label: string; Icon: LucideIcon }[] = [
  { value: "show", label: "Always show", Icon: Eye },
  { value: "auto", label: "Hide when empty", Icon: EyeClosed },
  { value: "hide", label: "Hide", Icon: EyeOff },
]
/* A column's view from what is stored: the columns on the board, and the ones that step aside while empty. */
export const columnViewOf = (column: string, visible: readonly string[], hideWhenEmpty: readonly string[]): ColumnView =>
  !visible.includes(column) ? "hide" : hideWhenEmpty.includes(column) ? "auto" : "show"
/* The stored choices after setting one column's view. */
export function withColumnView(column: string, view: ColumnView, visible: readonly string[], hideWhenEmpty: readonly string[]) {
  return {
    columns: view === "hide" ? visible.filter(id => id !== column) : visible.includes(column) ? [...visible] : [...visible, column],
    hideWhenEmpty: view === "auto" ? [...new Set([...hideWhenEmpty, column])] : hideWhenEmpty.filter(id => id !== column),
  }
}
export function ColumnViewPicker({ label, value, onChange }: { label: string; value: ColumnView; onChange: (view: ColumnView) => void }) {
  return <div className="agora-column-view" role="radiogroup" aria-label={`${label}: view`}>
    {COLUMN_VIEWS.map(({ value: view, label: name, Icon }) => <button key={view} type="button" role="radio" aria-checked={view === value} aria-label={`${label}: ${name}`} title={name} onClick={() => onChange(view)}><Icon size={14} aria-hidden="true" /></button>)}
  </div>
}
export function ColumnsMenu({ columns, visible, hideWhenEmpty, onChange }: { columns: { id: string; label: string }[]; visible: string[]; hideWhenEmpty: string[]; onChange: (column: string, view: ColumnView) => void }) {
  const shown = columns.filter(column => visible.includes(column.id)).length
  return <BoardMenu label={shown === columns.length ? "All columns" : `${shown} of ${columns.length} columns`} icon={<SlidersHorizontal size={14} />}>
    <ul className="agora-columns-menu" aria-label="Columns">
      {columns.map(column => {
        const view = columnViewOf(column.id, visible, hideWhenEmpty)
        return <li key={column.id}><span className="agora-badge" data-tone={column.id} data-hidden={view === "hide" || undefined}>{column.label}</span><ColumnViewPicker label={column.label} value={view} onChange={next => onChange(column.id, next)} /></li>
      })}
    </ul>
    <p className="agora-columns-legend">{COLUMN_VIEWS.map(({ value, label, Icon }) => <span key={value}><Icon size={12} aria-hidden="true" />{value === "show" ? "always" : label.toLowerCase()}</span>)}</p>
  </BoardMenu>
}
/* "Add card" offers every configured card type, so projects, sub-projects
   (epics) and tasks all start from the same place. */
const KIND_ICONS = { project: FolderKanban, epic: Layers, task: SquareCheck }
export function AddCardMenu({ workflow, disabled, onAdd }: { workflow: Workflow; disabled?: boolean; onAdd: (type: string) => void }) {
  return <Popover.Root>
    <Popover.Trigger asChild><button type="button" className="agora-btn agora-new-task" disabled={disabled}><Plus size={14} />Add card<ChevronDown size={12} /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="agora-menu" align="start" sideOffset={6} aria-label="Card type">
      {workflow.types.map(type => {
        const Icon = KIND_ICONS[type.kind]
        return <Popover.Close asChild key={type.id}><button className="agora-menu-option" onClick={() => onAdd(type.id)}><Icon size={14} />{type.label}</button></Popover.Close>
      })}
    </Popover.Content></Popover.Portal>
  </Popover.Root>
}
/* Scope narrows every page to one project or epic. The menu lists open
   projects with their epics indented beneath them; each is a link to that
   project's page where pages have URLs, otherwise it scopes in place. */
export type ScopeOption = { id: string; label: string; depth: number; kind: "project" | "epic"; href?: string }
export function ScopeMenu({ options, current, allHref, onPick }: { options: ScopeOption[]; current?: string | null; allHref?: string; onPick: (id: string | null) => void }) {
  const active = options.find(option => option.id === current)
  const entry = (key: string, id: string | null, label: string, href: string | undefined, depth: number, icon: ReactNode) => {
    const shared = { className: "agora-menu-option", style: { paddingLeft: 8 + depth * 18 }, "aria-current": (current ?? null) === id ? ("true" as const) : undefined }
    return <Popover.Close asChild key={key}>{href
      ? <a {...shared} href={href}>{icon}<span>{label}</span></a>
      : <button {...shared} type="button" onClick={() => onPick(id)}>{icon}<span>{label}</span></button>}</Popover.Close>
  }
  return <Popover.Root>
    <Popover.Trigger asChild><button type="button" className="agora-btn agora-scope-trigger" aria-label={active ? `Scope: ${active.label}` : undefined}><Target size={14} /><span>{active ? active.label : "Scope"}</span><ChevronDown size={12} /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="agora-menu agora-scope-menu" align="end" sideOffset={6} aria-label="Scope">
      {entry("all", null, "All work", allHref, 0, <Target size={14} aria-hidden="true" />)}
      {options.map(option => entry(option.id, option.id, option.label, option.href, option.depth, option.kind === "project" ? <FolderKanban size={14} aria-hidden="true" /> : <Layers size={14} aria-hidden="true" />))}
      {options.length === 0 && <p className="agora-menu-empty">No open projects or epics yet.</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>
}
/* The assignee on a card is also the control that changes it: click the
   avatar and pick a person, an agent, or nobody. */
const initials = (id: string) => id.slice(0, 2).toUpperCase()
export function AssigneeMenu({ people, value, cardTitle, onChange }: { people: Workflow["people"]; value?: string | null; cardTitle: string; onChange: (assignee: string | null) => void }) {
  const current = people.find(person => person.id === value)?.label ?? value ?? "nobody"
  return <Popover.Root>
    <Popover.Trigger asChild>
      <button type="button" className="agora-avatar agora-avatar-button" data-empty={!value || undefined} aria-label={`${cardTitle} is assigned to ${current}; change assignee`} title={`Assigned to ${current} · click to change`}>
        {value ? initials(value) : <UserPlus size={11} aria-hidden="true" />}
      </button>
    </Popover.Trigger>
    <Popover.Portal><Popover.Content className="agora-menu" align="end" sideOffset={6} aria-label="Assign to">
      {[{ id: "", label: "Unassigned" }, ...people].map(person => <Popover.Close asChild key={person.id || "none"}>
        <button className="agora-menu-option" aria-pressed={(value ?? "") === person.id} onClick={() => onChange(person.id || null)}>
          <span className="agora-avatar" aria-hidden="true">{person.id ? initials(person.id) : "–"}</span>{person.label}
        </button>
      </Popover.Close>)}
    </Popover.Content></Popover.Portal>
  </Popover.Root>
}
export type BoardPreferences = {
  view: "board" | "project" | "calendar" | "list" | "graph"
  types: string[] | null
  columns: string[] | null
  /* Shown columns that step aside while they hold no cards. */
  hideWhenEmpty: string[]
  properties: CardProperty[]
  fullCardLimit: number
  sortByColumn: Record<string, ColumnSort>
  collapsed: string[]
  /* Projects view: the hand-sorted project order and the name column's width. */
  projectOrder: string[]
  projectColumnWidth: number | null
  /* How many months the Projects timeline shows at once. */
  timelineSpan: TimelineSpan
}
const DEFAULT_PREFERENCES: BoardPreferences = { view: "board", types: null, columns: null, hideWhenEmpty: [], properties: ["description", "priority", "metadata", "type", "assignee"], fullCardLimit: 5, sortByColumn: {}, collapsed: [], projectOrder: [], projectColumnWidth: null, timelineSpan: 6 }
export function useBoardPreferences(key: string) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  useEffect(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) ?? "null")
      if (!value || typeof value !== "object") return
      const strings = (input: unknown): input is string[] => Array.isArray(input) && input.every(item => typeof item === "string")
      const next = { ...DEFAULT_PREFERENCES }
      if (["board", "project", "calendar", "list", "graph"].includes(value.view)) next.view = value.view
      // Scope used to be saved here; it now comes from the /project/<slug> URL.
      if (strings(value.types)) next.types = value.types
      if (strings(value.columns)) next.columns = value.columns
      if (strings(value.hideWhenEmpty)) next.hideWhenEmpty = value.hideWhenEmpty
      if (strings(value.collapsed)) next.collapsed = value.collapsed
      if (strings(value.projectOrder)) next.projectOrder = value.projectOrder
      if ((TIMELINE_SPANS as readonly number[]).includes(value.timelineSpan)) next.timelineSpan = value.timelineSpan
      if (typeof value.projectColumnWidth === "number" && value.projectColumnWidth >= 280 && value.projectColumnWidth <= 720) next.projectColumnWidth = value.projectColumnWidth
      if (strings(value.properties)) next.properties = value.properties.filter((item: string) => DEFAULT_PREFERENCES.properties.includes(item as CardProperty)) as CardProperty[]
      if ([0, 5, 10, 15, -1].includes(value.fullCardLimit)) next.fullCardLimit = value.fullCardLimit
      if (value.sortByColumn && typeof value.sortByColumn === "object") next.sortByColumn = Object.fromEntries(Object.entries(value.sortByColumn).filter(([, sort]) => ["manual", "priority-desc", "priority-asc", "created-desc", "created-asc", "updated-desc"].includes(String(sort)))) as Record<string, ColumnSort>
      // Hydrate browser-only preferences after the server's deterministic first render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreferences(next)
    } catch { /* Ignore malformed preferences; the board data remains independent. */ }
  }, [key])
  const update = (patch: Partial<BoardPreferences>) => {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    try { window.localStorage.setItem(key, JSON.stringify(next)) } catch { /* View controls still work without storage. */ }
  }
  return [preferences, update] as const
}
