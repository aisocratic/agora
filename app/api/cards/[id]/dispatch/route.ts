import { z } from "zod"
import { authorizeRequest } from "@/lib/server/authorization"
import { apiError, readJson } from "@/lib/server/http"
import { dispatchTask } from "@/lib/server/dispatch-repository"
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await authorizeRequest(request, true)
    const { id } = await context.params
    const input = z.object({ revision: z.number().int().nonnegative(), idempotencyKey: z.string().uuid() }).strict().parse(await readJson(request))
    const result = await dispatchTask(id, input.revision, input.idempotencyKey, principal)
    return Response.json(result, { status: result.dispatch.status === "pending" || result.dispatch.status === "uncertain" ? 202 : 200, headers: { "Cache-Control": "no-store" } })
  } catch (error) { return apiError(error) }
}
