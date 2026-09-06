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
  types: [...DEFAULT_WORKFLOW.types, { id: "bug", label: "Bug", kind: "task" }],
  agents: { ...DEFAULT_WORKFLOW.agents, models: ["default", "Sonnet", "Codex"] },
}
const examples = [
  ["A workspace for humans and agents", "Bring planning, execution, and review into one shared board.", "backlog", "epic", "you"],
  ["Add keyboard shortcuts", "Quickly create a task and move between views.", "backlog", "task", "codex"],
  ["Explore weekly planning", "A focused view of the work that matters this week.", "backlog", "task", "you"],
  ["Ship the dashboard", "Match the compact cards and controls from the admin workspace.", "todo", "epic", "codex"],
  ["Polish the card metadata", "Keep type, model, review flags, and assignee on one line.", "todo", "task", "claude"],
  ["Fix mobile column scrolling", "Keep the board easy to navigate on a narrow screen.", "todo", "bug", "codex"],
  ["Document the review workflow", "Explain how a task moves from implementation to review.", "todo", "task", "you"],
  ["Build the test dashboard", "Seed a separate board so changes are safe to try.", "doing", "task", "codex"],
  ["Improve dependency visibility", "Show the linked task count on the card face.", "doing", "task", "claude"],
  ["Review the empty states", "Check filters, empty columns, and the focus list.", "review", "task", "you"],
  ["Verify browser persistence", "Create a card, reload, and confirm the change is saved.", "review", "task", "codex"],
  ["Set up the shared design tokens", "Support light and dark themes with the same components.", "done", "task", "claude"],
  ["Use a separate app for task notes", "Keep context and comments alongside each task instead.", "wont-do", "task", "you"],
]
export const DEMO_BOARD: BoardData = {
  version: 1,
  cards: examples.map(([title, description, column, type, assignee], index) => ({
    id: `demo-${index + 1}`, title, description, column, type, assignee,
    priority: index % 3 + 1, model: assignee === "claude" ? "Sonnet" : assignee === "codex" ? "Codex" : null,
    archived: false, createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T12:00:00.000Z",
    needsHumanReview: column === "review", automerge: assignee !== "you",
    parentId: index === 4 || index === 5 ? "demo-4" : null,
    dependencies: index === 8 ? ["demo-8"] : [],
  })),
}
