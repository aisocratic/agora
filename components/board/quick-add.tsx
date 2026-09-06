"use client"

import { useRef, useState } from "react"
import { Plus } from "lucide-react"

export function QuickAdd({ label = "Add task", onAdd }: { label?: string; onAdd: (title: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const submit = async () => {
    if (submitting.current) return
    if (!title.trim()) { setAdding(false); return }
    submitting.current = true
    setBusy(true)
    setError("")
    try { await onAdd(title.trim()); setTitle(""); setAdding(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add this task.") }
    finally { submitting.current = false; setBusy(false) }
  }
  return <div className="agora-quick-add">
    {adding ? <input autoFocus aria-label={label} placeholder="What needs doing?" maxLength={200} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} onBlur={() => void submit()} onKeyDown={event => {
      if (event.key === "Enter") { event.preventDefault(); void submit() }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setTitle(""); setAdding(false) }
    }} /> : <button type="button" onClick={() => setAdding(true)}><Plus size={14} />{label}</button>}
    {error && <p role="alert">{error}</p>}
  </div>
}
