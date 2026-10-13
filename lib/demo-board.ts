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
// [title, description, column, type, assignee, parent index (1-based) or 0, priority, created day, updated day]
// Days count from 1 July 2026, so the project timeline shows work opening and
// moving across the summer and autumn. Ids follow the order below (demo-1…).
type Example = [string, string, string, string, string, number, 1 | 2 | 3, number, number]
const examples: Example[] = [
  // Agent-ready workspace (demo-1)
  ["Agent-ready workspace", "The top-level programme: plan, execute and review in one board.", "backlog", "project", "you", 0, 1, 6, 98],
  ["A workspace for humans and agents", "Bring planning, execution, and review into one shared board.", "backlog", "epic", "you", 1, 2, 32, 32],
  ["Add keyboard shortcuts", "Quickly create a task and move between views.", "backlog", "task", "codex", 2, 3, 40, 40],
  ["Explore weekly planning", "A focused view of the work that matters this week.", "backlog", "task", "you", 2, 1, 44, 44],
  ["Ship the dashboard", "Match the compact cards and controls from the admin workspace.", "todo", "epic", "codex", 1, 2, 46, 92],
  ["Polish the card metadata", "Keep type, model, review flags, and assignee on one line.", "todo", "task", "claude", 5, 3, 50, 90],
  ["Fix mobile column scrolling", "Keep the board easy to navigate on a narrow screen.", "todo", "bug", "codex", 5, 1, 55, 88],
  ["Document the review workflow", "Explain how a task moves from implementation to review.", "todo", "task", "you", 0, 2, 58, 94],
  ["Build the test dashboard", "Seed a separate board so changes are safe to try.", "doing", "task", "codex", 5, 3, 60, 96],
  ["Improve dependency visibility", "Show the linked task count on the card face.", "doing", "task", "claude", 0, 1, 62, 97],
  ["Review the empty states", "Check filters, empty columns, and the focus list.", "review", "task", "you", 0, 2, 64, 95],
  ["Verify browser persistence", "Create a card, reload, and confirm the change is saved.", "review", "task", "codex", 0, 3, 66, 98],
  ["Set up the shared design tokens", "Support light and dark themes with the same components.", "done", "task", "claude", 0, 1, 20, 36],
  ["Use a separate app for task notes", "Keep context and comments alongside each task instead.", "wont-do", "task", "you", 0, 2, 24, 30],
  // Agora launch (demo-15)
  ["Agora launch", "Take the board public: a demo anyone can try, docs, and the first shared deployments.", "todo", "project", "you", 0, 1, 70, 98],
  ["Public demo site", "A GitHub Pages build of the board with seeded data and no backend.", "doing", "epic", "claude", 15, 3, 72, 98],
  ["Publish the Pages demo", "Build the static bundle and wire the deploy workflow.", "done", "task", "claude", 16, 3, 74, 86],
  ["Record the walkthrough GIF", "Thirty seconds from empty board to a dispatched task.", "doing", "task", "you", 16, 2, 84, 98],
  ["Write the README quickstart", "Install, run locally, connect Postgres, invite an agent.", "review", "task", "codex", 16, 2, 80, 97],
  ["Shared boards", "Password and proxy auth, sessions, and the API tokens agents use.", "todo", "epic", "codex", 15, 2, 76, 95],
  ["Password login flow", "Login page, session cookie, and logout from the toolbar.", "done", "task", "codex", 20, 3, 78, 90],
  ["Session expiry logs users out mid-edit", "Refresh the session on activity instead of a fixed window.", "todo", "bug", "claude", 20, 3, 92, 95],
  ["Postgres migration runner", "Apply schema changes on start without a separate step.", "todo", "task", "codex", 20, 1, 88, 88],
  ["Announce on the AI Socratic newsletter", "A short note with the demo link and the agent story.", "backlog", "task", "you", 15, 1, 94, 94],
  // Agent dispatch (demo-25)
  ["Agent dispatch", "Hand a card to a coding agent and follow the work back to a pull request.", "doing", "project", "claude", 0, 1, 10, 98],
  ["Claude Code adapter", "Launch Claude Code against a card through a webhook or local command.", "doing", "epic", "claude", 25, 3, 12, 98],
  ["Webhook dispatch payload", "Send the card, its dependencies, and the board context as JSON.", "done", "task", "claude", 26, 3, 14, 40],
  ["Retry failed launches", "Back off and retry when the agent endpoint is unavailable.", "doing", "task", "claude", 26, 2, 52, 96],
  ["Surface PR links on cards", "Show the pull request the agent opened right on the card face.", "review", "task", "codex", 26, 2, 68, 98],
  ["Codex adapter", "The same dispatch contract for the Codex CLI.", "backlog", "epic", "codex", 25, 1, 82, 82],
  ["Codex harness smoke test", "Dispatch one card end to end and assert on the comment it leaves.", "backlog", "task", "codex", 30, 1, 86, 86],
  ["Dispatch policy docs", "Which cards agents may pick up, and who approves a merge.", "todo", "task", "you", 25, 2, 56, 90],
]
// Target dates by card number: a day, or a month while the day is not set.
// Dispatch policy docs is deliberately overdue so that state has an example.
const targets: Record<number, string> = {
  2: "2026-12", 5: "2026-10-23", 6: "2026-10-20", 7: "2026-10-30", 8: "2026-11", 9: "2026-10-16",
  15: "2026-11-18", 16: "2026-10-28", 18: "2026-10-21", 19: "2026-10-14", 20: "2026-11-12", 22: "2026-10-09", 24: "2026-11-19",
  25: "2027-01", 26: "2026-10-31", 29: "2026-10-12", 30: "2027-01", 32: "2026-10-02",
}
const images: Record<number, string> = {
  15: "https://pub-7a2c36ac409a4be0a469be59c0e02fd6.r2.dev/images/logo/ai-socratic-logo-light.svg",
}
const demoDay = (offset: number) => new Date(Date.UTC(2026, 6, 1 + offset, 12)).toISOString()
export const DEMO_BOARD: BoardData = {
  version: 1,
  cards: examples.map(([title, description, column, type, assignee, parent, priority, created, updated], index) => ({
    id: `demo-${index + 1}`, title, description, column, type, assignee, priority,
    model: assignee === "claude" ? "Sonnet" : assignee === "codex" ? "Codex" : null,
    archived: false, createdAt: demoDay(created), updatedAt: demoDay(Math.max(created, updated)),
    needsHumanReview: column === "review", automerge: assignee !== "you",
    parentId: parent ? `demo-${parent}` : null,
    dependencies: index === 9 ? ["demo-9"] : index === 28 ? ["demo-27"] : index === 30 ? ["demo-27"] : [],
    prUrl: index === 28 ? "https://github.com/aisocratic/agora/pull/42" : null,
    dueDate: targets[index + 1] ?? null,
    imageUrl: images[index + 1] ?? null,
  })),
}
