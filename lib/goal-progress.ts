import { z } from "zod"

/* A measured outcome for any card, e.g. "accounts found 32/100": what the work
   has achieved, independent of the card's column. Same shape and limits as the
   AI Socratic website's board (lib/todo/goal-progress.ts), so either API accepts
   what the other returns. */
export const goalProgressSchema = z.object({
  label: z.string().trim().min(1).max(80),
  current: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  total: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict().refine((value) => value.current <= value.total, { message: "Completed count cannot exceed the goal", path: ["current"] })

export type GoalProgress = z.infer<typeof goalProgressSchema>

export const goalProgressPercent = ({ current, total }: GoalProgress) => Math.min(100, Math.round(current / total * 100))
