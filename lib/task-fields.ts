import { z } from "zod"

const name = z.string().trim().min(1).max(100)
export const commentSchema = z.object({
  id: z.string().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  author: name,
  createdAt: z.string().datetime(),
}).strict()
export const taskFieldsSchema = z.object({
  type: name.optional(),
  assignee: name.nullable().optional(),
  effort: name.nullable().optional(),
  model: name.nullable().optional(),
  harness: name.nullable().optional(),
  prUrl: z.url().refine((url) => /^https?:\/\//.test(url), "Use an HTTP or HTTPS PR URL").nullable().optional(),
  automerge: z.boolean().optional(),
  needsHumanReview: z.boolean().optional(),
  parentId: z.string().min(1).max(200).nullable().optional(),
  dependencies: z.array(z.string().min(1).max(200)).max(1000).optional(),
  comments: z.array(commentSchema).max(10000).optional(),
})
export type TaskFields = z.infer<typeof taskFieldsSchema>
export type CardComment = z.infer<typeof commentSchema>
