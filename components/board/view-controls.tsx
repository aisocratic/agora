"use client"

import { useEffect, useState, type ReactNode } from "react"
import * as Popover from "@radix-ui/react-popover"
import { ChevronDown } from "lucide-react"
import type { CardProperty, ColumnSort } from "../../lib/board-view"

export function BoardMenu({ label, icon, children, className = "", align = "end" }: { label: ReactNode; icon?: ReactNode; children: ReactNode; className?: string; align?: "start" | "end" }) {
  return <Popover.Root><Popover.Trigger asChild><button type="button" className={`agora-btn ${className}`}>{icon}{label}<ChevronDown size={12} /></button></Popover.Trigger><Popover.Portal><Popover.Content className="agora-menu" align={align} sideOffset={6}>{children}</Popover.Content></Popover.Portal></Popover.Root>
}
export function CheckMenu({ label, icon, options, selected, onChange }: { label: string; icon?: ReactNode; options: {id: string; label: string}[]; selected: string[]; onChange: (next: string[]) => void }) {
  return <BoardMenu label={label} icon={icon}>
    {options.map(option => <label className="agora-menu-check" key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={event => onChange(event.target.checked ? [...selected, option.id] : selected.filter(id => id !== option.id))} />{option.label}</label>)}
    <button className="agora-menu-reset" onClick={() => onChange(options.map(option => option.id))}>Select all</button>
  </BoardMenu>
}
export type BoardPreferences = {
  view: "board" | "focus" | "graph"
  types: string[] | null
  columns: string[] | null
  properties: CardProperty[]
  fullCardLimit: number
  sortByColumn: Record<string, ColumnSort>
  scope: string | null
  collapsed: string[]
}
const DEFAULT_PREFERENCES: BoardPreferences = { view: "board", types: null, columns: null, properties: ["description", "priority", "metadata", "type", "assignee"], fullCardLimit: 5, sortByColumn: {}, scope: null, collapsed: [] }
export function useBoardPreferences(key: string) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  useEffect(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) ?? "null")
      if (!value || typeof value !== "object") return
      const strings = (input: unknown): input is string[] => Array.isArray(input) && input.every(item => typeof item === "string")
      const next = { ...DEFAULT_PREFERENCES }
      if (["board", "focus", "graph"].includes(value.view)) next.view = value.view
      if (typeof value.scope === "string") next.scope = value.scope
      if (strings(value.types)) next.types = value.types
      if (strings(value.columns)) next.columns = value.columns
      if (strings(value.collapsed)) next.collapsed = value.collapsed
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
