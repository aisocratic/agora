import { z } from "zod"
import { updateBoard } from "@/lib/board"
import { reviewAction, REVIEW_STATUSES } from "@/lib/review"
import { authorizeRequest } from "@/lib/server/authorization"
import { transactBoard } from "@/lib/server/board-repository"
import { getPublicWorkflow } from "@/lib/server/configuration"
import { apiError, noCache, readJson } from "@/lib/server/http"

/* A person's (or a token's) verdict on a card in review: approve, or request
   changes with a comment. The reviewer is the authenticated principal. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorizeRequest(request, true)
    const { id } = await context.params
    const input = z.object({
      verdict: z.enum(REVIEW_STATUSES),
      comment: z.string().max(10000).optional(),
      revision: z.number().int().nonnegative(),
    }).strict().parse(await readJson(request))
    const workflow = await getPublicWorkflow()
    const result = await transactBoard(input.revision, (board) =>
      updateBoard(board, reviewAction(board, id, input.verdict, input.comment, workflow, user.name), undefined, workflow))
    return Response.json(result, { headers: noCache })
  } catch (error) { return apiError(error) }
}
