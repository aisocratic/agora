import type { BoardCard } from "./board"
import type { Workflow } from "./workflow"

/* How far a parent card is: the share of the work at the bottom of its tree
   that is done. Pure, so the board, the scope breadcrumb and the tests share
   it. Follows the AI Socratic website's board (lib/todo/subtasks.ts) so the
   two show the same numbers for the same cards. */

/* A won't-do column finishes a card without doing it: like an archived card,
   it drops out of the count instead of counting as done. */
const DROPPED_COLUMNS = new Set(["wont-do"])

export type SubtaskProgress = {
  /* Leaves that count: everything not archived or dropped. */
  total: number
  done: number
  /* Whole percent of `total` that is done. */
  percent: number
}

/* The work at the bottom of a card's tree: every card under it that has no
   cards of its own. A card's completion counts these, not its direct children:
   an epic whose one task is split into ten subtasks is as far along as they
   are, not 0% until that task closes. */
export function leafDescendants<T extends { id: string }>(id: string, childrenOf: (id: string) => readonly T[]): T[] {
  const leaves: T[] = []
  const seen = new Set([id])
  const visit = (parent: string) => {
    for (const child of childrenOf(parent)) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      if (childrenOf(child.id).length) visit(child.id)
      else leaves.push(child)
    }
  }
  visit(id)
  return leaves
}

/* How far a set of leaves is, or null when none of them count. Done means a
   column whose role is done (and not a won't-do column). */
export function subtaskProgress(cards: readonly BoardCard[], workflow: Workflow): SubtaskProgress | null {
  const counted = cards.filter(card => !card.archived && !DROPPED_COLUMNS.has(card.column))
  if (!counted.length) return null
  const done = counted.filter(card => workflow.columns.find(column => column.id === card.column)?.role === "done").length
  return { total: counted.length, done, percent: Math.round((done / counted.length) * 100) }
}

/* One lookup per board: each card's subtree completion, by ID. Every card
   counts wherever it sits, whatever column or filter hides it on screen. */
export function subtreeProgress(cards: readonly BoardCard[], workflow: Workflow) {
  const children = new Map<string, BoardCard[]>()
  for (const card of cards) if (card.parentId) children.set(card.parentId, [...(children.get(card.parentId) ?? []), card])
  const childrenOf = (id: string) => children.get(id) ?? []
  const cache = new Map<string, SubtaskProgress | null>()
  return (id: string): SubtaskProgress | null => {
    if (!cache.has(id)) cache.set(id, childrenOf(id).length ? subtaskProgress(leafDescendants(id, childrenOf), workflow) : null)
    return cache.get(id)!
  }
}
