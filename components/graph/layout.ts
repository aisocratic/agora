import type { BoardCard, BoardData } from "../../lib/board"
import { planBoard, type BoardPlan, type PlanReason } from "../../lib/planner"
import type { Workflow } from "../../lib/workflow"
export type GraphStatus = "Ready now" | "Future wave" | "Blocked" | "Human review" | "Human assigned" | "Needs breakdown" | "Merge review" | "Completed" | "Container" | "Missing card"
export interface GraphNode { id: string; title: string; card?: BoardCard; status: GraphStatus; reasons: PlanReason[]; x: number; y: number }
export interface DependencyGraph { nodes: GraphNode[]; edges: BoardPlan["edges"]; width: number; height: number }
export const NODE_WIDTH = 240, NODE_HEIGHT = 108
/** Layout only. All eligibility, expansion and reasons come from the shared planner. */
export function layoutGraph(board: BoardData, plan: BoardPlan): DependencyGraph {
  const nodes = new Map<string, GraphNode>()
  for (const card of [...board.cards].sort((a, b) => a.id.localeCompare(b.id))) nodes.set(card.id, { id: card.id, title: card.title, card, status: "Container", reasons: [], x: 0, y: 0 })
  for (const id of plan.completed) { const node = nodes.get(id); if (node) node.status = "Completed" }
  const groups = [[plan.blocked, "Blocked"], [plan.gated, "Human review"], [plan.humanAssigned, "Human assigned"], [plan.needsBreakdown, "Needs breakdown"], [plan.readyToMerge, "Merge review"], ...plan.waves.map((wave, index) => [wave, index ? "Future wave" : "Ready now"] as const)] as const
  for (const [items, status] of groups) for (const item of items) { const node = nodes.get(item.id); if (node) { node.status = status; node.reasons = item.reasons } }
  for (const edge of plan.edges) for (const id of [edge.from, edge.to]) if (!nodes.has(id)) nodes.set(id, { id, title: `Missing card: ${id}`, status: "Missing card", reasons: [{ code: "missing-dependency", message: "This referenced card is missing. Edit the dependent card to repair the relationship.", relatedIds: [id] }], x: 0, y: 0 })
  const indegree = new Map([...nodes.keys()].map(id => [id, 0])), outgoing = new Map<string, string[]>()
  for (const edge of plan.edges) { indegree.set(edge.to, indegree.get(edge.to)! + 1); outgoing.set(edge.from, [...outgoing.get(edge.from) ?? [], edge.to]) }
  const layers: string[][] = []
  let ready = [...nodes.keys()].filter(id => indegree.get(id) === 0).sort()
  const placed = new Set<string>()
  while (ready.length) {
    layers.push(ready); const next: string[] = []
    for (const id of ready) { placed.add(id); for (const to of outgoing.get(id) ?? []) { indegree.set(to, indegree.get(to)! - 1); if (indegree.get(to) === 0) next.push(to) } }
    ready = next.sort()
  }
  // Cycles keep every node and edge; their planner reasons explain the blockage.
  const unresolved = [...nodes.keys()].filter(id => !placed.has(id)).sort()
  if (unresolved.length) layers.push(unresolved)
  let x = 24, height = 0
  for (const layer of layers) {
    layer.forEach((id, index) => { const node = nodes.get(id)!; node.x = x + Math.floor(index / 12) * 300; node.y = 24 + index % 12 * 148; height = Math.max(height, node.y + NODE_HEIGHT + 24) })
    x += Math.ceil(layer.length / 12) * 300
  }
  return { nodes: [...nodes.values()], edges: plan.edges, width: Math.max(288, x - 36), height: Math.max(156, height) }
}
export function buildGraph(board: BoardData, workflow: Workflow) { return layoutGraph(board, planBoard(board, workflow)) }
export function fitGraph(width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const zoom = Math.max(0.001, Math.min(1, (viewportWidth - 32) / width, (viewportHeight - 32) / height))
  return { zoom, x: (viewportWidth - width * zoom) / 2, y: (viewportHeight - height * zoom) / 2 }
}
