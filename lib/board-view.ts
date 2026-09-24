import type { BoardCard } from "./board"
import { TYPE_LEVELS, typeLevel, type Workflow } from "./workflow"

export type CardProperty = "description" | "priority" | "metadata" | "type" | "assignee"
export type ColumnSort = "manual" | "priority-desc" | "priority-asc" | "created-desc" | "created-asc" | "updated-desc"
export const SORT_OPTIONS: { value: ColumnSort; label: string }[] = [
  { value: "manual", label: "Manual (drag order)" },
  { value: "priority-desc", label: "Priority: high → low" },
  { value: "priority-asc", label: "Priority: low → high" },
  { value: "created-desc", label: "Created: newest first" },
  { value: "created-asc", label: "Created: oldest first" },
  { value: "updated-desc", label: "Recently updated" },
]
export function sortCards(cards: BoardCard[], sort: ColumnSort): BoardCard[] {
  if (sort === "manual") return cards
  const tie = (a: BoardCard, b: BoardCard) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  return [...cards].sort((a, b) => {
    const order = sort === "priority-desc" ? (b.priority ?? 1) - (a.priority ?? 1)
      : sort === "priority-asc" ? (a.priority ?? 1) - (b.priority ?? 1)
      : sort === "created-desc" ? b.createdAt.localeCompare(a.createdAt)
      : sort === "created-asc" ? a.createdAt.localeCompare(b.createdAt)
      : b.updatedAt.localeCompare(a.updatedAt)
    return order || tie(a, b)
  })
}
/* Group work under the project it belongs to, following parents up the chain so
   a task under an epic still lands beneath that epic's project. Work with no
   project of its own is listed last rather than hidden. */
export function projectGroups(cards: BoardCard[], workflow: Workflow) {
  const live = cards.filter(card => !card.archived)
  const byId = new Map(live.map(card => [card.id, card]))
  const isProject = (card: BoardCard) => typeLevel(workflow, card.type) === TYPE_LEVELS.project
  const projectOf = (card: BoardCard) => {
    const seen = new Set<string>()
    let current: BoardCard | undefined = card
    while (current && !seen.has(current.id)) {
      if (isProject(current)) return current
      seen.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return undefined
  }
  const projects = sortCards(live.filter(isProject), "priority-desc")
  const groups = projects.map(project => ({
    project,
    cards: sortCards(live.filter(card => card.id !== project.id && projectOf(card)?.id === project.id), "priority-desc"),
  }))
  const loose = sortCards(live.filter(card => !isProject(card) && !projectOf(card)), "priority-desc")
  return { groups, loose }
}
