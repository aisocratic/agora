import type { BoardCard, BoardData } from "./board"
import type { Workflow } from "./workflow"

export type PlanReason = { code: string; message: string; relatedIds: string[] }
export type PlanItem = BoardCard & { reasons: PlanReason[]; prerequisites: string[]; runnable: boolean; mergeAllowed: boolean }
export type BoardPlan = {
  readyToMerge: PlanItem[]; waves: PlanItem[][]; blocked: PlanItem[]; needsBreakdown: PlanItem[]
  humanAssigned: PlanItem[]; gated: PlanItem[]; completed: string[]; containers: string[]
  runnableNow: string[]; edges: { from: string; to: string }[]
}
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const reason = (code: string, message: string, relatedIds: string[] = []): PlanReason => ({ code, message, relatedIds: [...new Set(relatedIds)].sort(order) })

/** One graph for planning, dispatch eligibility and the graph view. Edges run prerequisite -> dependent. */
export function planBoard(board: BoardData, workflow: Workflow): BoardPlan {
  const cards = new Map(board.cards.map((card) => [card.id, card]))
  const sorted = [...cards.values()].sort((a, b) => order(a.id, b.id))
  const children = new Map<string, BoardCard[]>()
  for (const card of sorted) if (card.parentId) children.set(card.parentId, [...(children.get(card.parentId) ?? []), card])
  const role = (card: BoardCard) => workflow.columns.find((column) => column.id === card.column)?.role
  const complete = (card: BoardCard) => card.archived || role(card) === "done"
  const plan: BoardPlan = { readyToMerge: [], waves: [], blocked: [], needsBreakdown: [], humanAssigned: [], gated: [], completed: [], containers: [], runnableNow: [], edges: [] }
  const items = new Map<string, PlanItem>()
  const candidates = new Set<string>()
  const prerequisites = new Map<string, Set<string>>()
  const defaultType = workflow.types.find((type) => type.kind === "task")?.id

  for (const card of sorted) {
    const item: PlanItem = { ...card, reasons: [], prerequisites: [], runnable: false, mergeAllowed: false }
    const ancestors: BoardCard[] = []
    const seen = new Set([card.id])
    let parent = card.parentId
    while (parent) {
      if (seen.has(parent)) { item.reasons.push(reason("hierarchy-cycle", "Parent hierarchy contains a cycle.", [...seen, parent])); break }
      seen.add(parent)
      const ancestor = cards.get(parent)
      if (!ancestor) { item.reasons.push(reason("missing-parent", "A parent card is missing.", [parent])); break }
      ancestors.push(ancestor)
      parent = ancestor.parentId
    }
    const expanded = new Set<string>()
    const expand = (id: string, path: Set<string>) => {
      const dependency = cards.get(id)
      if (!dependency) { expanded.add(id); item.reasons.push(reason("missing-dependency", "A dependency card is missing.", [id])); return }
      if (complete(dependency)) { expanded.add(id); return }
      if (path.has(id)) { expanded.add(id); item.reasons.push(reason("hierarchy-cycle", "Dependency expansion encountered a parent cycle.", [...path, id])); return }
      const descendants = children.get(id) ?? []
      if (!descendants.length) { expanded.add(id); return }
      for (const child of descendants) expand(child.id, new Set([...path, id]))
    }
    for (const source of [card, ...ancestors]) for (const dependency of source.dependencies ?? []) expand(dependency, new Set())
    item.prerequisites = [...expanded].sort(order)
    prerequisites.set(card.id, expanded)
    for (const from of item.prerequisites) plan.edges.push({ from, to: card.id })
    // Completed targets retain their graph relations, but never block scheduling.
    if (complete(card)) { plan.completed.push(card.id); continue }
    items.set(card.id, item)

    const type = workflow.types.find((type) => type.id === (card.type ?? defaultType))
    if ((children.get(card.id)?.length ?? 0) > 0) {
      if (item.reasons.length) plan.blocked.push(item)
      else plan.containers.push(card.id)
      continue
    }
    if (item.reasons.length) { plan.blocked.push(item); continue }
    if (!type) { item.reasons.push(reason("unknown-type", "Choose a configured task type.")); plan.blocked.push(item); continue }
    if (type.kind === "epic") { item.reasons.push(reason("needs-breakdown", "This epic needs executable child tasks.")); plan.needsBreakdown.push(item); continue }
    const gated = [card, ...ancestors].filter((source) => source.needsHumanReview)
    if (gated.length) { item.reasons.push(reason("human-review", "Human review is required before work starts.", gated.map((source) => source.id))); plan.gated.push(item); continue }
    const person = workflow.people.find((person) => person.id === card.assignee)
    if (person?.kind === "human") { item.reasons.push(reason("human-assigned", "Human assignments are never dispatched to an agent.", [card.id])); plan.humanAssigned.push(item); continue }
    if (!person) { item.reasons.push(reason("unknown-assignee", "Assign the task to a configured agent; unknown or unset identities are not agents.")); plan.blocked.push(item); continue }
    if (ancestors.some(complete)) item.reasons.push(reason("completed-parent", "A parent is completed or archived; review this child before scheduling.", ancestors.filter(complete).map((source) => source.id)))
    if (!role(card)) item.reasons.push(reason("unknown-column", "Choose a configured workflow column."))
    if (item.reasons.length) { plan.blocked.push(item); continue }
    if (role(card) === "review" && card.prUrl) {
      const unfinished = item.prerequisites.filter((id) => !cards.has(id) || !complete(cards.get(id)!))
      if (unfinished.length) {
        item.reasons.push(reason("merge-prerequisite", "Complete all task and parent dependencies before merge review.", unfinished))
        plan.blocked.push(item); continue
      }
      item.mergeAllowed = card.automerge === true
      item.reasons.push(reason("merge-review", card.automerge ? "Automatic merge policy is enabled; required checks and review approval still apply." : "Human merge approval is required; automerge is disabled."))
      plan.readyToMerge.push(item); continue
    }
    if (!workflow.agents.enabled) item.reasons.push(reason("agents-disabled", "Agent workflows are disabled."))
    if (role(card) !== "todo") item.reasons.push(reason("not-ready", "Only a task in a ready (todo) column can be dispatched."))
    if (!workflow.columns.some((column) => column.role === "doing")) item.reasons.push(reason("missing-doing", "Configure an active (doing) column before dispatch."))
    for (const [field, options] of [["effort", "efforts"], ["model", "models"], ["harness", "harnesses"]] as const)
      if (card[field] && !workflow.agents[options].includes(card[field]!)) item.reasons.push(reason("unknown-runtime", `Choose a configured ${field} before dispatch.`))
    if (item.reasons.length) plan.blocked.push(item)
    else candidates.add(card.id)
  }

  // Tarjan SCCs include every cycle member even when DFS reaches an already
  // visited cross edge. Completed nodes are absent from this scheduling graph.
  const indices = new Map<string, number>(), lowlinks = new Map<string, number>()
  const stack: string[] = [], onStack = new Set<string>(), cycles: string[][] = []
  let nextIndex = 0
  const visit = (id: string) => {
    indices.set(id, nextIndex); lowlinks.set(id, nextIndex); nextIndex++
    stack.push(id); onStack.add(id)
    for (const dependency of prerequisites.get(id) ?? []) {
      if (!items.has(dependency)) continue
      if (!indices.has(dependency)) {
        visit(dependency)
        lowlinks.set(id, Math.min(lowlinks.get(id)!, lowlinks.get(dependency)!))
      } else if (onStack.has(dependency)) {
        lowlinks.set(id, Math.min(lowlinks.get(id)!, indices.get(dependency)!))
      }
    }
    if (lowlinks.get(id) !== indices.get(id)) return
    const component: string[] = []
    let member: string
    do { member = stack.pop()!; onStack.delete(member); component.push(member) } while (member !== id)
    if (component.length > 1 || prerequisites.get(id)?.has(id)) cycles.push(component.sort(order))
  }
  for (const id of items.keys()) if (!indices.has(id)) visit(id)
  const groups = [plan.readyToMerge, plan.blocked, plan.needsBreakdown, plan.humanAssigned, plan.gated]
  for (const component of cycles) for (const id of component) {
    const item = items.get(id)!
    item.reasons.push(reason("dependency-cycle", "Expanded dependencies contain a cycle.", component))
    candidates.delete(id)
    for (const group of groups) { const index = group.indexOf(item); if (index >= 0) group.splice(index, 1) }
    plan.containers = plan.containers.filter((container) => container !== id)
    plan.blocked.push(item)
  }

  // A future wave is valid only if every unfinished prerequisite is itself schedulable.
  for (;;) {
    let changed = false
    for (const id of [...candidates].sort(order)) {
      const unavailable = [...(prerequisites.get(id) ?? [])].filter((dependency) => !candidates.has(dependency) && (!cards.has(dependency) || !complete(cards.get(dependency)!)))
      if (!unavailable.length) continue
      const item = items.get(id)!
      item.reasons.push(reason("blocked-prerequisite", "Complete or resolve these task and parent dependencies before dispatch.", unavailable))
      candidates.delete(id); plan.blocked.push(item); changed = true
    }
    if (!changed) break
  }
  const pending = new Set(candidates)
  while (pending.size) {
    const wave = [...pending].filter((id) => [...(prerequisites.get(id) ?? [])].every((dependency) => !pending.has(dependency))).sort(order)
    if (!wave.length) break // Cycles were already removed above.
    plan.waves.push(wave.map((id) => {
      const item = items.get(id)!
      item.runnable = plan.waves.length === 0
      if (!item.runnable) item.reasons.push(reason("future-wave", "Complete all task and parent dependencies before dispatch.", item.prerequisites))
      return item
    }))
    wave.forEach((id) => pending.delete(id))
  }
  plan.runnableNow = plan.waves[0]?.map((item) => item.id) ?? []
  for (const group of groups) group.sort((a, b) => order(a.id, b.id))
  plan.edges.sort((a, b) => order(a.from, b.from) || order(a.to, b.to))
  return plan
}

export function plannerDispatchBlockReason(board: BoardData, card: BoardCard, workflow: Workflow): string | null {
  const plan = planBoard(board, workflow)
  if (plan.runnableNow.includes(card.id)) return null
  const item = [...plan.waves.flat(), ...plan.blocked, ...plan.needsBreakdown, ...plan.humanAssigned, ...plan.gated, ...plan.readyToMerge].find((item) => item.id === card.id)
  return item?.reasons[0]?.message ?? (plan.completed.includes(card.id) ? "Completed or archived cards cannot be dispatched." : "Only configured leaf tasks can be dispatched.")
}
