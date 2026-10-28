"use client"

import { useState } from "react"
import { goalProgressPercent, goalProgressSchema, type GoalProgress } from "../../lib/goal-progress"

/* A card's measured outcome as one compact line: the label, the count and a
   thin bar. */
export function GoalProgressRow({ progress }: { progress?: GoalProgress | null }) {
  if (!progress) return null
  const percent = goalProgressPercent(progress)
  const description = `${progress.label}: ${progress.current} of ${progress.total} · ${percent}%`
  return <div className="agora-card-goal" data-card-goal-progress title={description}>
    <span>{progress.label} {progress.current}/{progress.total} · {percent}%</span>
    <div role="progressbar" aria-label={description} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></div>
  </div>
}

/* Sets, changes or removes a card's measured goal. Counts are checked before
   they reach the draft, so a half-typed goal never blocks saving the card. */
export function GoalProgressField({ progress, onChange, prefix }: { progress?: GoalProgress | null; onChange: (progress: GoalProgress | null) => void; prefix: string }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState("")
  const [current, setCurrent] = useState("0")
  const [total, setTotal] = useState("")
  const [error, setError] = useState("")
  if (!editing) return <div className="agora-goal-field">
    <GoalProgressRow progress={progress} />
    <button type="button" className="agora-btn" onClick={() => {
      setLabel(progress?.label ?? ""); setCurrent(String(progress?.current ?? 0)); setTotal(progress ? String(progress.total) : ""); setError(""); setEditing(true)
    }}>{progress ? "Edit progress" : "Add measurable goal"}</button>
  </div>
  return <fieldset className="agora-goal-field agora-goal-editor">
    <legend>Measurable goal</legend>
    <div><label htmlFor={`${prefix}-goal-label`}>Progress label</label><input id={`${prefix}-goal-label`} maxLength={80} value={label} onChange={event => setLabel(event.target.value)} placeholder="Accounts found" /></div>
    <div className="agora-goal-counts">
      <div><label htmlFor={`${prefix}-goal-current`}>Completed</label><input id={`${prefix}-goal-current`} type="number" min={0} step={1} value={current} onChange={event => setCurrent(event.target.value)} /></div>
      <div><label htmlFor={`${prefix}-goal-total`}>Goal</label><input id={`${prefix}-goal-total`} type="number" min={1} step={1} value={total} onChange={event => setTotal(event.target.value)} /></div>
    </div>
    {error && <p className="agora-dialog-error" role="alert">{error}</p>}
    <div className="agora-dialog-actions">
      {progress && <button type="button" className="agora-btn" onClick={() => { onChange(null); setEditing(false) }}>Remove goal</button>}
      <button type="button" className="agora-btn" onClick={() => setEditing(false)}>Cancel</button>
      <button type="button" className="agora-btn agora-primary" onClick={() => {
        const parsed = goalProgressSchema.safeParse({ label, current: current.trim() ? Number(current) : NaN, total: total.trim() ? Number(total) : NaN })
        if (!parsed.success) { setError("Enter a label and whole counts: 0 ≤ completed ≤ goal, with a goal above zero."); return }
        onChange(parsed.data)
        setEditing(false)
      }}>Save progress</button>
    </div>
  </fieldset>
}
