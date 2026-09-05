import { BoardValidationError, type BoardAction, type BoardData } from "./board"
import type { Workflow } from "./workflow"

export function validateConfiguredAction(board: BoardData, action: BoardAction, workflow: Workflow) {
  if (!["create", "edit", "move"].includes(action.type)) return
  const existing = board.cards.find((card) => card.id === action.id)
  const check = (value: string | null | undefined, previous: string | null | undefined, allowed: string[], label: string) => {
    if (value === null || value === undefined || value === previous) return
    if (!allowed.includes(value)) throw new BoardValidationError(`Choose a configured ${label}. Historical values can be kept unchanged.`)
  }
  if (action.type === "move") {
    check(action.column, existing?.column, workflow.columns.map((column) => column.id), "column")
    return
  }
  if (action.type !== "create" && action.type !== "edit") return
  const draft = action.draft
  check(draft.column, existing?.column, workflow.columns.map((column) => column.id), "column")
  check(draft.type, existing?.type, workflow.types.map((type) => type.id), "type")
  check(draft.assignee, existing?.assignee, workflow.people.map((person) => person.id), "assignee")
  for (const [field, options] of [["effort", "efforts"], ["model", "models"], ["harness", "harnesses"]] as const)
    check(draft[field], existing?.[field], workflow.agents[options], field)
}
