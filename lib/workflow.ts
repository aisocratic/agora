import { z } from "zod"

const id = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)
const label = z.string().trim().min(1).max(100)
export const workflowSchema = z.object({
  columns: z.array(z.object({ id, label, role: z.enum(["backlog", "todo", "doing", "review", "done"]) }).strict()).min(1).max(30),
  types: z.array(z.object({ id, label, kind: z.enum(["task", "epic"]) }).strict()).min(1).max(30),
  people: z.array(z.object({ id, label, kind: z.enum(["human", "agent"]) }).strict()).max(200),
  agents: z.object({ enabled: z.boolean(), efforts: z.array(label).max(100), models: z.array(label).max(100), harnesses: z.array(label).max(100) }).strict(),
}).strict().superRefine((value, context) => {
  for (const key of ["columns", "types", "people"] as const)
    if (new Set(value[key].map((item) => item.id)).size !== value[key].length) context.addIssue({ code: "custom", message: `Duplicate ${key} IDs.` })
  for (const key of ["efforts", "models", "harnesses"] as const)
    if (new Set(value.agents[key]).size !== value.agents[key].length) context.addIssue({ code: "custom", message: `Duplicate ${key}.` })
})
export type Workflow = z.infer<typeof workflowSchema>
export type WorkflowColumn = Workflow["columns"][number]
export const DEFAULT_WORKFLOW: Workflow = {
  columns: [
    { id: "backlog", label: "Backlog", role: "backlog" }, { id: "todo", label: "Todo", role: "todo" },
    { id: "doing", label: "Doing", role: "doing" }, { id: "review", label: "Review", role: "review" },
  ],
  types: [{ id: "task", label: "Task", kind: "task" }, { id: "epic", label: "Epic", kind: "epic" }],
  people: [{ id: "you", label: "You", kind: "human" }, { id: "claude", label: "Claude", kind: "agent" }, { id: "codex", label: "Codex", kind: "agent" }],
  agents: { enabled: true, efforts: ["low", "medium", "high"], models: ["default"], harnesses: ["claude-code", "codex"] },
}
