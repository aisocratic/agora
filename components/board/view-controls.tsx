"use client"

import { useEffect, useState, type ReactNode } from "react"
import * as Popover from "@radix-ui/react-popover"
import { ChevronDown, FolderKanban, Layers, Plus, SquareCheck, Target, UserPlus } from "lucide-react"
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
const DEFAULT_PREFERENCES: BoardPreferences = { view: "board", types: null, columns: null, properties: ["description", "priority", "metadata", "type", "assignee"], fullCardLimit: 5, sortByColumn: {}, collapsed: [], projectOrder: [], projectColumnWidth: null, timelineSpan: 6 }
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
