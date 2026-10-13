import { z } from "zod"

const name = z.string().trim().min(1).max(100)
/* Uploads are downscaled before they are stored, so 200k characters is ample
   for a cover while keeping the whole board well under the request limit. */
export const MAX_IMAGE_LENGTH = 200_000
const DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}(#dark)?$/
export function isImageSource(value: string) {
  if (DATA_IMAGE.test(value)) return true
  if (value.length > 2000 || !/^https?:\/\//.test(value)) return false
  try { new URL(value); return true } catch { return false }
}
export const commentSchema = z.object({
  id: z.string().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  author: name,
  createdAt: z.string().datetime(),
}).strict()
export const taskFieldsSchema = z.object({
  type: name.optional(),
  priority: z.number().int().min(1).max(3).optional(),
  assignee: name.nullable().optional(),
  effort: name.nullable().optional(),
  model: name.nullable().optional(),
  harness: name.nullable().optional(),
  prUrl: z.url().refine((url) => /^https?:\/\//.test(url), "Use an HTTP or HTTPS PR URL").nullable().optional(),
  /* A logo or cover image, shown as a tile beside a project or epic: a web
     address, or an uploaded image kept inline as a small raster data URL. */
  imageUrl: z.string().max(MAX_IMAGE_LENGTH).refine((value) => isImageSource(value), "Use an HTTP(S) image URL or an uploaded PNG, JPEG, WebP or GIF").nullable().optional(),
  /* The day work is due, or just its month while the day is still to be set. */
  dueDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/, "Use YYYY-MM-DD, or YYYY-MM while the day is not set")
    .refine((value) => value.length === 7 || new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), "Use a real calendar day").nullable().optional(),
  automerge: z.boolean().optional(),
  needsHumanReview: z.boolean().optional(),
  parentId: z.string().min(1).max(200).nullable().optional(),
  dependencies: z.array(z.string().min(1).max(200)).max(1000).optional(),
  comments: z.array(commentSchema).max(10000).optional(),
})
export type TaskFields = z.infer<typeof taskFieldsSchema>
export type CardComment = z.infer<typeof commentSchema>
