import { DEFAULT_WORKFLOW } from "./workflow"
import { taskFieldsSchema, type TaskFields, type CardComment } from "./task-fields"

export class BoardValidationError extends Error {}

export const COLUMNS = DEFAULT_WORKFLOW.columns
export type ColumnId = string
export type BoardCard = TaskFields & {
  id: string
  title: string
  description: string
  column: ColumnId
  archived: boolean
  createdAt: string
  updatedAt: string
}
export type BoardData = { version: 1; cards: BoardCard[] }
export const EMPTY_BOARD: BoardData = { version: 1, cards: [] }
export type CardDraft = Pick<BoardCard, "title" | "description" | "column"> & Omit<TaskFields, "comments">
export type BoardAction =
  | { type: "create"; id: string; draft: CardDraft }
  | { type: "edit"; id: string; draft: CardDraft }
  | { type: "move"; id: string; column: ColumnId; position: number }
  | { type: "archive" | "restore" | "delete"; id: string }
  | { type: "comment"; id: string; comment: CardComment }

export function isColumn(value: unknown): value is ColumnId {
  return typeof value === "string" && value.length > 0 && value.length <= 100 && !/[\x00-\x1f\x7f]/.test(value)
}

export function parseBoard(raw: string): BoardData {
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw new BoardValidationError("Invalid board JSON.") }
  if (
    !data ||
    typeof data !== "object" ||
    !("version" in data) ||
    data.version !== 1 ||
    !("cards" in data) ||
    !Array.isArray(data.cards)
  ) {
    throw new BoardValidationError("Unsupported board format")
  }
  const ids = new Set<string>()
  const commentIds = new Set<string>()
  const cards: BoardCard[] = data.cards.map((card: unknown) => {
    if (!card || typeof card !== "object") throw new BoardValidationError("Invalid card")
    const c = card as Record<string, unknown>
    if (
      typeof c.id !== "string" ||
      !c.id ||
      ids.has(c.id) ||
      typeof c.title !== "string" ||
      !c.title.trim() ||
      c.title.length > 200 ||
      typeof c.description !== "string" ||
      c.description.length > 10000 ||
      !isColumn(c.column) ||
      typeof c.archived !== "boolean" ||
      typeof c.createdAt !== "string" ||
      typeof c.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(c.createdAt)) ||
      !Number.isFinite(Date.parse(c.updatedAt))
    ) {
      throw new BoardValidationError("Invalid card data")
    }
    ids.add(c.id)
    const fields = taskFieldsSchema.parse(c)
    for (const comment of fields.comments ?? []) {
      if (commentIds.has(comment.id)) throw new BoardValidationError("Duplicate comment ID.")
      commentIds.add(comment.id)
    }
    return {
      ...fields,
      id: c.id,
      title: c.title,
      description: c.description,
      column: c.column,
      archived: c.archived,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }
  })
  const board: BoardData = { version: 1, cards }
  validateRelations(board)
  return board
}

export function validateRelations(board: BoardData) {
  const cards = new Map(board.cards.map((card) => [card.id, card]))
  for (const card of board.cards) {
    const refs = [...(card.dependencies ?? []), ...(card.parentId ? [card.parentId] : [])]
    if (refs.some((id) => id === card.id || !cards.has(id)))
      throw new BoardValidationError("Dependencies and parents must reference another existing card.")
    if (new Set(card.dependencies).size !== (card.dependencies?.length ?? 0))
      throw new BoardValidationError("A dependency may only be listed once.")
  }
  // Parent and dependency graphs have distinct meanings; each must be acyclic.
  for (const kind of ["dependencies", "parent"] as const) {
    const visited = new Set<string>()
    const active = new Set<string>()
    const visit = (id: string) => {
      if (active.has(id)) throw new BoardValidationError(`${kind === "parent" ? "Parent" : "Dependency"} cycle detected.`)
      if (visited.has(id)) return
      active.add(id)
      const card = cards.get(id)!
      for (const next of kind === "parent" ? (card.parentId ? [card.parentId] : []) : card.dependencies ?? []) visit(next)
      active.delete(id)
      visited.add(id)
    }
    cards.forEach((_, id) => visit(id))
  }
}

function validateDraft(draft: CardDraft): CardDraft {
  const title = draft.title.trim()
  if (!title) throw new BoardValidationError("Give the card a title.")
  if (title.length > 200 || draft.description.length > 10000 || !isColumn(draft.column))
    throw new BoardValidationError("Check the card fields and try again.")
  return { ...taskFieldsSchema.omit({ comments: true }).parse(draft), title, description: draft.description, column: draft.column }
}

export function updateBoard(
  board: BoardData,
  action: BoardAction,
  now = new Date().toISOString(),
): BoardData {
  const next = applyAction(board, action, now)
  validateRelations(next)
  return next
}

function applyAction(board: BoardData, action: BoardAction, now: string): BoardData {
  if (action.type === "create") {
    if (board.cards.some((card) => card.id === action.id))
      throw new BoardValidationError("This card already exists.")
    return {
      ...board,
      cards: [
        ...board.cards,
        {
          ...validateDraft(action.draft),
          id: action.id,
          archived: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    }
  }
  const card = board.cards.find((item) => item.id === action.id)
  if (!card)
    throw new BoardValidationError("This card was removed in another tab. Your other cards are unchanged.")
  if (action.type === "delete") {
    if (!card.archived) throw new BoardValidationError("Archive a card before deleting it.")
    if (board.cards.some((item) => item.parentId === card.id || item.dependencies?.includes(card.id)))
      throw new BoardValidationError("Remove this card's parent and dependency references before deleting it.")
    return { ...board, cards: board.cards.filter((item) => item.id !== action.id) }
  }
  if (action.type === "comment") {
    return { ...board, cards: board.cards.map((item) => item.id === card.id
      ? { ...item, comments: [...(item.comments ?? []), action.comment], updatedAt: now } : item) }
  }
  if (action.type === "move") {
    if (!isColumn(action.column) || card.archived) throw new BoardValidationError("This card cannot be moved.")
    const others = board.cards.filter((item) => item.id !== card.id)
    const destination = others.filter((item) => item.column === action.column && !item.archived)
    const position = Math.min(destination.length, Math.max(0, action.position))
    const before = destination[position]
    const last = destination[destination.length - 1]
    const index = before ? others.indexOf(before) : last ? others.indexOf(last) + 1 : others.length
    others.splice(index, 0, { ...card, column: action.column, updatedAt: now })
    return { ...board, cards: others }
  }
  return {
    ...board,
    cards: board.cards.map((item) =>
      item.id === card.id
        ? {
            ...item,
            ...(action.type === "edit"
              ? validateDraft(action.draft)
              : { archived: action.type === "archive" }),
            updatedAt: now,
          }
        : item,
    ),
  }
}
