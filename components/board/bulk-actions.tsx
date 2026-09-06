"use client"

import { BoardSelect } from "./board-select"
import { Archive, X } from "lucide-react"
import type { CardDraft } from "../../lib/board"
import type { Workflow } from "../../lib/workflow"

export type BulkCommand = { type: "move"; column: string } | { type: "patch"; patch: Partial<CardDraft> } | { type: "archive" }
export function BulkActions({ count, workflow, busy, onCommand, onClear }: { count: number; workflow: Workflow; busy: boolean; onCommand: (command: BulkCommand) => void; onClear: () => void }) {
  if (!count) return null
  return <div className="agora-bulk-actions" role="region" aria-label="Selected card actions">
    <span>{count} selected</span>
    <BoardSelect aria-label="Move selected cards" value="" disabled={busy} placeholder="Move to…" onValueChange={column => onCommand({ type: "move", column })} options={workflow.columns.map(column => ({ value: column.id, label: column.label }))} />
    <BoardSelect aria-label="Selected cards priority" value="" disabled={busy} placeholder="Priority…" onValueChange={value => onCommand({ type: "patch", patch: { priority: Number(value) } })} options={[{value:"1",label:"Low"},{value:"2",label:"Medium"},{value:"3",label:"High"}]} />
    <BoardSelect aria-label="Assign selected cards" value="" disabled={busy} placeholder="Assign to…" onValueChange={value => onCommand({ type: "patch", patch: { assignee: value === "__none" ? null : value } })} options={[{value:"__none",label:"Unassigned"}, ...workflow.people.map(person => ({ value: person.id, label: person.label }))]} />
    <button className="agora-btn" disabled={busy} onClick={() => onCommand({ type: "archive" })}><Archive size={14} />Archive</button>
    <button className="agora-icon" disabled={busy} aria-label="Clear selection" onClick={onClear}><X size={14} /></button>
  </div>
}
