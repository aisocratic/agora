export const COLUMNS = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "Todo" },
  { id: "doing", label: "Doing" },
  { id: "review", label: "Review" },
] as const
export type ColumnId = (typeof COLUMNS)[number]["id"]
export type BoardCard = {
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
export type CardDraft = Pick<BoardCard, "title" | "description" | "column">
export type BoardAction =
  | { type: "create"; id: string; draft: CardDraft }
  | { type: "edit"; id: string; draft: CardDraft }
  | { type: "move"; id: string; column: ColumnId; position: number }
  | { type: "archive" | "restore" | "delete"; id: string }

export function isColumn(value: unknown): value is ColumnId {
  return COLUMNS.some((column) => column.id === value)
}

export function parseBoard(raw: string): BoardData {
  const data: unknown = JSON.parse(raw)
  if (
    !data ||
    typeof data !== "object" ||
    !("version" in data) ||
    data.version !== 1 ||
    !("cards" in data) ||
    !Array.isArray(data.cards)
  ) {
    throw new Error("Unsupported board format")
  }
  const ids = new Set<string>()
  const cards: BoardCard[] = data.cards.map((card: unknown) => {
    if (!card || typeof card !== "object") throw new Error("Invalid card")
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
      typeof c.updatedAt !== "string"
    ) {
      throw new Error("Invalid card data")
    }
    ids.add(c.id)
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      column: c.column,
      archived: c.archived,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }
  })
  return { version: 1, cards }
}

function validateDraft(draft: CardDraft): CardDraft {
  const title = draft.title.trim()
  if (!title) throw new Error("Give the card a title.")
  if (title.length > 200 || draft.description.length > 10000 || !isColumn(draft.column))
    throw new Error("Check the card fields and try again.")
  return { ...draft, title }
}

export function updateBoard(
  board: BoardData,
  action: BoardAction,
  now = new Date().toISOString(),
): BoardData {
  if (action.type === "create") {
    if (board.cards.some((card) => card.id === action.id))
      throw new Error("This card already exists.")
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
    throw new Error("This card was removed in another tab. Your other cards are unchanged.")
  if (action.type === "delete") {
    if (!card.archived) throw new Error("Archive a card before deleting it.")
    return { ...board, cards: board.cards.filter((item) => item.id !== action.id) }
  }
  if (action.type === "move") {
    if (!isColumn(action.column) || card.archived) throw new Error("This card cannot be moved.")
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
