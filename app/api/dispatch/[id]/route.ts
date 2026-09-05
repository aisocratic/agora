import { z } from "zod"
import { authorizeRequest } from "@/lib/server/authorization"
import { apiError } from "@/lib/server/http"
import { readDispatch } from "@/lib/server/dispatch-repository"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await authorizeRequest(request)
    const id = z.string().uuid().parse((await context.params).id)
    return Response.json(await readDispatch(id), { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return apiError(error) }
}
