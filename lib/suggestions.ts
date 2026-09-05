import { z } from "zod"
import type { CardDraft } from "./board"
import { taskFieldsSchema } from "./task-fields"
import type { Workflow } from "./workflow"
export const suggestionDraftSchema = taskFieldsSchema.omit({ comments: true }).extend({
  title: z.string().trim().min(1).max(200), description: z.string().max(10000).default(""), column: z.string().min(1).max(100).optional(),
}).strict()
export const submissionSchema = z.object({ draft: suggestionDraftSchema, reason: z.string().max(4000).default("") }).strict()
export const reviewSchema = z.object({ version: z.number().int().positive(), draft: suggestionDraftSchema }).strict()
export const acceptanceSchema = reviewSchema.extend({ revision: z.number().int().nonnegative() }).strict()
export const dismissalSchema = z.object({ version: z.number().int().positive(), note: z.string().max(2000).default("") }).strict()
export type SuggestionState = "pending" | "accepted" | "dismissed"
export interface Suggestion {
  id: string; author: { name: string; kind: "local" | "session" | "token" | "proxy" }; proposal: CardDraft; reviewedDraft: CardDraft | null;
  reason: string; state: SuggestionState; version: number; acceptedCardId: string | null; reviewedBy: string | null; decisionNote: string;
  createdAt: string; updatedAt: string; reviewedAt: string | null;
}
export interface SuggestionList { suggestions: Suggestion[]; counts: Record<SuggestionState, number>; limit: number; offset: number }
export function normalizeSuggestionDraft(input: unknown, workflow: Workflow): CardDraft {
  const draft = suggestionDraftSchema.parse(input)
  return { ...draft, column: draft.column ?? workflow.columns.find(column => column.role === "backlog")?.id ?? workflow.columns[0].id }
}
