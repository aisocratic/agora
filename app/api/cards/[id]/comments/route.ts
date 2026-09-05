import { z } from "zod"
import { authorizeRequest } from "@/lib/server/authorization"
import { mutateBoard } from "@/lib/server/board-repository"
import { apiError, noCache, readJson } from "@/lib/server/http"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorizeRequest(request, true)
    const { id } = await context.params
    const input = z.object({ body: z.string().trim().min(1).max(10000), revision: z.number().int().nonnegative() }).strict().parse(await readJson(request))
    const result = await mutateBoard({ type: "comment", id, comment: {
      id: crypto.randomUUID(), body: input.body, author: user.name, createdAt: new Date().toISOString(),
    } }, input.revision)
    return Response.json(result, { status: 201, headers: noCache })
  } catch (error) { return apiError(error) }
}
