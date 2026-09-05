import { z, ZodError } from "zod"
import { BoardValidationError } from "../board"
import { taskFieldsSchema } from "../task-fields"
import { ConflictError } from "./board-repository"
import { HttpError } from "./authorization"

const id = z.string().min(1).max(200)
const column = z.string().min(1).max(100)
const draft = taskFieldsSchema.omit({ comments: true }).extend({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000), column,
}).strict()
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), id, draft }).strict(),
  z.object({ type: z.literal("edit"), id, draft }).strict(),
  z.object({ type: z.literal("move"), id, column, position: z.number().int().min(0) }).strict(),
  z.object({ type: z.enum(["archive", "restore", "delete"]), id }).strict(),
])
export const mutationSchema = z.object({ action: actionSchema, revision: z.number().int().nonnegative() }).strict()

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "Send application/json.")
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, "JSON body required.")
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.length
    if (size > 2_000_000) { await reader.cancel(); throw new HttpError(413, "Request is too large.") }
    chunks.push(chunk.value)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) }
  catch { throw new HttpError(400, "Invalid JSON.") }
}

export function apiError(error: unknown): Response {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status })
  if (error instanceof ConflictError) return Response.json({ error: error.message }, { status: 409 })
  if (error instanceof ZodError) return Response.json({ error: error.issues.map((issue) => issue.message).join("; ") }, { status: 400 })
  // Domain errors are safe to expose. Database errors never expose SQL or connection details.
  if (error instanceof BoardValidationError) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ error: "The shared board is unavailable. Please try again." }, { status: 503 })
}

export const noCache = { "Cache-Control": "private, no-cache" }
