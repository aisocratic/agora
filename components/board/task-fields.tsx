import { BoardSelect } from "./board-select"
import { CoverField } from "./cover-field"
import { GoalProgressField } from "./goal-progress"
import type { BoardCard, BoardData, CardDraft } from "../../lib/board"
import { typeLevel, type Workflow } from "../../lib/workflow"

export function TaskFields({ draft, onChange, board, card, workflow, prefix, hideIdentity = false }: {
  hideIdentity?: boolean; draft: CardDraft; onChange: (draft: CardDraft) => void; board: BoardData; card?: BoardCard; workflow: Workflow; prefix: string
}) {
  const blockedParents = new Set(card ? [card.id] : [])
  let found = true
  while (found) {
    found = false
    for (const item of board.cards) {
      if (item.parentId && blockedParents.has(item.parentId) && !blockedParents.has(item.id)) { blockedParents.add(item.id); found = true }
    }
  }
  /* A card only nests under a strictly higher level: tasks under epics or
     projects, epics under projects, projects at the top. */
  const level = typeLevel(workflow, draft.type)
  const parents = board.cards.filter(item => !blockedParents.has(item.id) && typeLevel(workflow, item.type) > level)
  const fields = [
    { key: "type", label: "Type", options: workflow.types },
    { key: "assignee", label: "Assignee", options: workflow.people },
    { key: "effort", label: "Effort", options: workflow.agents.efforts.map((id) => ({ id, label: id })) },
    { key: "model", label: "Model", options: workflow.agents.models.map((id) => ({ id, label: id })) },
    { key: "harness", label: "Harness", options: workflow.agents.harnesses.map((id) => ({ id, label: id })) },
  ] as const
  return <details className="agora-task-fields"><summary>{hideIdentity ? "Execution and dependencies" : "Task settings and dependencies"}</summary>
    <div className="agora-fields">
      {!hideIdentity && <div><label htmlFor={`${prefix}-priority`}>Priority</label><select id={`${prefix}-priority`} value={draft.priority ?? 1} onChange={event => onChange({ ...draft, priority: Number(event.target.value) })}><option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option></select></div>}
      {fields.filter(field => !hideIdentity || (field.key !== "type" && field.key !== "assignee")).map(({ key, label, options }) => <div key={key}>
        <label htmlFor={`${prefix}-${key}`}>{label}</label>
        {hideIdentity ? <BoardSelect id={`${prefix}-${key}`} value={draft[key] ?? ""} onValueChange={value => onChange({ ...draft, [key]: value || null })} options={[
          {value:"",label:"Not set"},
          ...(draft[key] && !options.some(option => option.id === draft[key]) ? [{value:draft[key]!,label:`${draft[key]} (unconfigured)`}] : []),
          ...options.map(option => ({value:option.id,label:option.label})),
        ]} /> : <select id={`${prefix}-${key}`} value={draft[key] ?? ""} onChange={(event) => onChange({ ...draft, [key]: event.target.value || (key === "type" ? undefined : null) })}>
          <option value="">{key === "type" ? "Default task" : "Not set"}</option>
          {draft[key] && !options.some((option) => option.id === draft[key]) && <option value={draft[key]!}>{draft[key]} (unconfigured)</option>}
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>}
      </div>)}
      {!hideIdentity && <PlanningFields draft={draft} onChange={onChange} workflow={workflow} prefix={prefix} />}
      <div><label htmlFor={`${prefix}-pr`}>PR URL</label><input id={`${prefix}-pr`} type="url" value={draft.prUrl ?? ""} onChange={(event) => onChange({ ...draft, prUrl: event.target.value || null })} placeholder="https://github.com/owner/repo/pull/1" /></div>
      <div><label htmlFor={`${prefix}-parent`}>Parent card</label>{hideIdentity ? <BoardSelect id={`${prefix}-parent`} value={draft.parentId ?? ""} onValueChange={value => onChange({ ...draft, parentId: value || null })} options={[{value:"",label:"No parent"}, ...parents.map(item => ({value:item.id,label:`${item.title}${item.archived ? " (archived)" : ""}`}))]} /> : <select id={`${prefix}-parent`} value={draft.parentId ?? ""} onChange={(event) => onChange({ ...draft, parentId: event.target.value || null })}>
        <option value="">No parent</option>
        {parents.map((item) => <option key={item.id} value={item.id}>{item.title}{item.archived ? " (archived)" : ""}</option>)}
      </select>}</div>
      <fieldset><legend>Dependencies</legend>
        {board.cards.filter((item) => item.id !== card?.id).map((item) => <label key={item.id} className="agora-check">
          <input type="checkbox" checked={draft.dependencies?.includes(item.id) ?? false} onChange={(event) => onChange({ ...draft, dependencies: event.target.checked ? [...(draft.dependencies ?? []), item.id] : (draft.dependencies ?? []).filter((id) => id !== item.id) })} />
          {item.title}{item.archived ? " (archived)" : ""}
        </label>)}
        {board.cards.filter((item) => item.id !== card?.id).length === 0 && <p>No other cards yet.</p>}
      </fieldset>
      <label className="agora-check"><input type="checkbox" checked={draft.needsHumanReview ?? false} onChange={(event) => onChange({ ...draft, needsHumanReview: event.target.checked })} />Human review required before work</label>
      <label className="agora-check"><input type="checkbox" checked={draft.automerge ?? false} onChange={(event) => onChange({ ...draft, automerge: event.target.checked })} />Allow automatic merge after review</label>
    </div>
  </details>
}

/* When the work is due and how it looks on the planning views: a target day
   (or just a month while the day is open) and, for projects and epics, a
   cover image to upload, link, or remove. */
export function PlanningFields({ draft, onChange, workflow, prefix }: { draft: CardDraft; onChange: (draft: CardDraft) => void; workflow: Workflow; prefix: string }) {
  const level = typeLevel(workflow, draft.type)
  const monthOnly = draft.dueDate?.length === 7
  return <>
    <div><label htmlFor={`${prefix}-due`}>Target date</label>
      {monthOnly
        ? <input id={`${prefix}-due`} type="month" value={draft.dueDate ?? ""} onChange={event => onChange({ ...draft, dueDate: event.target.value || null })} />
        : <input id={`${prefix}-due`} type="date" value={draft.dueDate ?? ""} onChange={event => onChange({ ...draft, dueDate: event.target.value || null })} />}
      <label className="agora-check"><input type="checkbox" checked={monthOnly} onChange={event => onChange({ ...draft, dueDate: draft.dueDate ? (event.target.checked ? draft.dueDate.slice(0, 7) : `${draft.dueDate.slice(0, 7)}-01`) : null })} disabled={!draft.dueDate} />Day not set yet</label>
    </div>
    {(level > 1 || draft.imageUrl) && <div><label htmlFor={`${prefix}-image`}>Cover image</label>
      <CoverField id={`${prefix}-image`} value={draft.imageUrl} onChange={imageUrl => onChange({ ...draft, imageUrl })} />
    </div>}
    <GoalProgressField progress={draft.progress} prefix={prefix} onChange={progress => onChange({ ...draft, progress })} />
  </>
}
