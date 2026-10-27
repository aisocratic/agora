import { updateBoard, type BoardAction, type BoardCard, type BoardData, type ColumnId } from "./board"

/* What a drop does when several cards travel together. Pure, so the group case
   is tested without a browser. Follows the AI Socratic website's board
   (board-drop.ts), adapted to Agora's move actions. */

/* The cards a drag of `activeId` carries: the whole selection when the card is
   part of one, else just the card. Board order is kept. */
export function dragGroupOf(cards: readonly BoardCard[], activeId: string, selectedIds?: ReadonlySet<string>): BoardCard[] {
  if (selectedIds && selectedIds.size > 1 && selectedIds.has(activeId))
    return cards.filter(card => !card.archived && selectedIds.has(card.id))
  const one = cards.find(card => card.id === activeId && !card.archived)
  return one ? [one] : []
}

/* The move actions that land `ids` in `column`, in board order, just before
   the card `beforeId` (or at the column's end when it is null, unknown or one
   of the group's own cards). Each position is worked out on the board as the
   moves before it leave it, so a server applying them one by one ends with the
   group together. Empty when nothing would change. */
export function groupMoveActions(board: BoardData, ids: readonly string[], column: ColumnId, beforeId: string | null): BoardAction[] {
  const wanted = new Set(ids)
  const group = board.cards.filter(card => wanted.has(card.id) && !card.archived)
  if (!group.length) return []
  const before = beforeId && !wanted.has(beforeId) ? beforeId : null
  // Dropped on its own cards with none of them changing column: nothing moves.
  if (!before && beforeId && wanted.has(beforeId) && group.every(card => card.column === column)) return []
  const actions: BoardAction[] = []
  let next = board
  let previous: string | null = null
  for (const card of group) {
    const destination = next.cards.filter(item => item.column === column && !item.archived && item.id !== card.id)
    const anchor = previous ? destination.findIndex(item => item.id === previous) + 1 : before ? destination.findIndex(item => item.id === before) : -1
    const position = anchor < 0 ? destination.length : anchor
    const action: BoardAction = { type: "move", id: card.id, column, position }
    actions.push(action)
    next = updateBoard(next, action)
    previous = card.id
  }
  // A group already standing just there, in that order, needs no writes.
  const order = (data: BoardData) => data.cards.filter(item => item.column === column && !item.archived).map(item => item.id).join()
  return order(next) === order(board) && group.every(card => card.column === column) ? [] : actions
}
