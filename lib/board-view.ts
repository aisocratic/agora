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
   project of its own is listed last rather than hidden. `all` is the whole
   board: parents are looked up there, so a card keeps its project even when a
   filter hides the project card or the epic in between. */
export function projectGroups(cards: BoardCard[], workflow: Workflow, all: BoardCard[] = cards) {
  const live = cards.filter(card => !card.archived)
  const byId = new Map(all.filter(card => !card.archived).map(card => [card.id, card]))
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
  const owners = new Map<string, BoardCard>()
  for (const card of live) {
    const project = projectOf(card)
    if (project) owners.set(project.id, project)
  }
  const projects = sortCards([...owners.values()], "priority-desc")
  const groups = projects.map(project => ({
    project,
    cards: sortCards(live.filter(card => card.id !== project.id && projectOf(card)?.id === project.id), "priority-desc"),
  }))
  const loose = sortCards(live.filter(card => !isProject(card) && !projectOf(card)), "priority-desc")
  return { groups, loose }
}

/* The project view nests a project's work one level deeper: epics (and any
   other mid-level type) carry the tasks parented to them, while tasks that
   hang straight off the project, or off a parent outside the group, stand on
   their own. Cards stay in the group's priority order throughout. */
export type ProjectNode = { card: BoardCard; children: BoardCard[] }
export function projectNodes(cards: BoardCard[], workflow: Workflow): ProjectNode[] {
  const parents = new Set(cards.filter(card => typeLevel(workflow, card.type) > TYPE_LEVELS.task).map(card => card.id))
  return cards
    .filter(card => !(card.parentId && parents.has(card.parentId)))
    .map(card => ({ card, children: parents.has(card.id) ? cards.filter(child => child.parentId === card.id) : [] }))
}

/* Target dates drive the timeline, as on the planning page: a day is a point,
   a month without a day is a span across that month. Undated work falls back
   to the stretch it has been active, from creation to its last change. */
export const finished = (card: BoardCard, workflow: Workflow) => workflow.columns.find(column => column.id === card.column)?.role === "done"
/* Sort key: the target day, the end of a target month, then undated work by age. */
export const dueSortKey = (card: BoardCard) => card.dueDate ? (card.dueDate.length === 7 ? `${card.dueDate}-32` : card.dueDate) : `~${card.createdAt}`
const monthName = (month: string, style: "long" | "short") => new Intl.DateTimeFormat("en-US", { month: style, year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))
export function dueLabel(card: BoardCard): string | null {
  if (!card.dueDate) return null
  if (card.dueDate.length === 7) return `${monthName(card.dueDate, "long")} · day TBD`
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${card.dueDate}T12:00:00Z`))
}
export const overdue = (card: BoardCard, workflow: Workflow, today: string) => !!card.dueDate && !finished(card, workflow) && (card.dueDate.length === 7 ? card.dueDate < today.slice(0, 7) : card.dueDate < today)

/* The timeline shows a window of whole months: 1, 3, 6 or 12 of them, starting
   wherever the reader has paged to (this month, to begin with). */
const monthOf = (iso: string) => iso.slice(0, 7)
const shiftMonth = (month: string, by: number) => {
  const [year, index] = month.split("-").map(Number)
  const date = new Date(Date.UTC(year, index - 1 + by, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}
export const TIMELINE_SPANS = [1, 3, 6, 12] as const
export type TimelineSpan = (typeof TIMELINE_SPANS)[number]
export const monthWindow = (start: string, count: number) => Array.from({ length: count }, (_, index) => shiftMonth(start, index))
export const addMonths = shiftMonth
export const monthLabel = (month: string, style: "long" | "short" = "short") => monthName(month, style)
const daysIn = (month: string) => { const [year, index] = month.split("-").map(Number); return new Date(Date.UTC(year, index, 0)).getUTCDate() }
/* Horizontal position of a day as a fraction (0–1) of the whole month range;
   days before the range sit at 0 and days after it at 1. */
export function timelinePosition(date: string, months: string[]): number {
  const month = monthOf(date)
  if (month < months[0]) return 0
  if (month > months[months.length - 1]) return 1
  const index = months.indexOf(month)
  return (index + (Number(date.slice(8, 10)) - 0.5) / daysIn(month)) / months.length
}
/* A card's bar runs from its creation to its last change, clipped to the
   window; a stretch that falls wholly outside the window has no bar. */
export function timelineSpan(card: BoardCard, months: string[]) {
  const last = card.updatedAt > card.createdAt ? card.updatedAt : card.createdAt
  if (monthOf(last) < months[0] || monthOf(card.createdAt) > months[months.length - 1]) return null
  const start = timelinePosition(card.createdAt, months)
  return { start, end: Math.max(start, timelinePosition(last, months)) }
}

/* Project pages live at /project/<slug>. The slug comes from the title
   ("AI Socratic" → "ai-socratic"); the card ID and the exact title, as typed
   into the address bar, resolve too. Only projects and sub-projects scope. */
export const slugify = (title: string) => title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled"
export function findScope(cards: BoardCard[], workflow: Workflow, slug: string): BoardCard | undefined {
  let wanted = slug
  try { wanted = decodeURIComponent(slug) } catch { /* Keep the raw slug. */ }
  const candidates = cards.filter(card => !card.archived && typeLevel(workflow, card.type) > TYPE_LEVELS.task)
  return candidates.find(card => card.id === wanted)
    ?? candidates.find(card => slugify(card.title) === slugify(wanted))
}
/* Whether a card sits at or beneath the scoped card, following parents up. */
export function withinScope(cards: BoardCard[], card: BoardCard, scopeId: string) {
  const byId = new Map(cards.map(item => [item.id, item]))
  const visited = new Set<string>()
  let current: BoardCard | undefined = card
  while (current && !visited.has(current.id)) {
    if (current.id === scopeId) return true
    visited.add(current.id)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return false
}
