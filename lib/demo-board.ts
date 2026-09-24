import { type BoardData } from "./board"
import { DEFAULT_WORKFLOW, type Workflow } from "./workflow"

export const DEMO_STORAGE_KEY = "agora.test-dashboard.v1"
export const DEMO_WORKFLOW: Workflow = {
  ...DEFAULT_WORKFLOW,
  columns: [
    { id: "backlog", label: "Backlog", role: "backlog" },
    { id: "todo", label: "Todo", role: "todo" },
    { id: "doing", label: "In Progress", role: "doing" },
    { id: "review", label: "Review", role: "review" },
    { id: "done", label: "Done", role: "done" },
    { id: "wont-do", label: "Won’t do", role: "done" },
  ],
  types: DEFAULT_WORKFLOW.types,
  agents: { ...DEFAULT_WORKFLOW.agents, models: ["default", "Sonnet", "Codex"] },
}
// [title, description, column, type, assignee, parent index (1-based) or 0]
const examples = [
  ["Agent-ready workspace", "The top-level programme: plan, execute and review in one board.", "backlog", "project", "you", 0],
  ["A workspace for humans and agents", "Bring planning, execution, and review into one shared board.", "backlog", "epic", "you", 1],
  ["Add keyboard shortcuts", "Quickly create a task and move between views.", "backlog", "task", "codex", 2],
  ["Explore weekly planning", "A focused view of the work that matters this week.", "backlog", "task", "you", 2],
  ["Ship the dashboard", "Match the compact cards and controls from the admin workspace.", "todo", "epic", "codex", 1],
  ["Polish the card metadata", "Keep type, model, review flags, and assignee on one line.", "todo", "task", "claude", 5],
  ["Fix mobile column scrolling", "Keep the board easy to navigate on a narrow screen.", "todo", "bug", "codex", 5],
  ["Document the review workflow", "Explain how a task moves from implementation to review.", "todo", "task", "you", 0],
  ["Build the test dashboard", "Seed a separate board so changes are safe to try.", "doing", "task", "codex", 5],
  ["Improve dependency visibility", "Show the linked task count on the card face.", "doing", "task", "claude", 0],
  ["Review the empty states", "Check filters, empty columns, and the focus list.", "review", "task", "you", 0],
  ["Verify browser persistence", "Create a card, reload, and confirm the change is saved.", "review", "task", "codex", 0],
  ["Set up the shared design tokens", "Support light and dark themes with the same components.", "done", "task", "claude", 0],
  ["Use a separate app for task notes", "Keep context and comments alongside each task instead.", "wont-do", "task", "you", 0],
]
export const DEMO_BOARD: BoardData = {
  version: 1,
  cards: examples.map(([title, description, column, type, assignee, parent], index) => ({
    id: `demo-${index + 1}`, title: title as string, description: description as string,
    column: column as string, type: type as string, assignee: assignee as string,
    priority: index % 3 + 1, model: assignee === "claude" ? "Sonnet" : assignee === "codex" ? "Codex" : null,
    archived: false, createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T12:00:00.000Z",
    needsHumanReview: column === "review", automerge: assignee !== "you",
    parentId: parent ? `demo-${parent}` : null,
    dependencies: index === 9 ? ["demo-9"] : [],
  })),
}
