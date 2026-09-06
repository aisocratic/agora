import type { BoardCard } from "./board"
import type { Workflow } from "./workflow"

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
export function focusCards(cards: BoardCard[], workflow: Workflow) {
  const roleOf = (card: BoardCard) => workflow.columns.find(column => column.id === card.column)?.role
  return {
    inProgress: sortCards(cards.filter(card => !card.archived && ["doing", "review"].includes(roleOf(card) ?? "")), "priority-desc"),
    upNext: sortCards(cards.filter(card => !card.archived && roleOf(card) === "todo"), "priority-desc"),
  }
}
