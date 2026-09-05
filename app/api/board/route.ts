import { boardPlanResponse } from "@/lib/server/board-plan-response"
import { z } from "zod"
import { parseBoard } from "@/lib/board"
import { authorizeRequest } from "@/lib/server/authorization"
import { mutateBoard, transactBoard } from "@/lib/server/board-repository"
import { apiError, mutationSchema, noCache, readJson } from "@/lib/server/http"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    return await boardPlanResponse(request)
  } catch (error) { return apiError(error) }
}

export async function POST(request: Request) {
  try {
    await authorizeRequest(request, true)
    const { action, revision } = mutationSchema.parse(await readJson(request))
    const result = await mutateBoard(action, revision)
    return Response.json(result, { headers: { ...noCache, ETag: `"${result.revision}"` } })
  } catch (error) { return apiError(error) }
}

// Backup import is additive and preserves existing IDs; it never resets shared data.
export async function PUT(request: Request) {
  try {
    await authorizeRequest(request, true)
    const input = z.object({ revision: z.number().int().nonnegative(), board: z.unknown() }).strict().parse(await readJson(request))
    const incoming = parseBoard(JSON.stringify(input.board))
    const result = await transactBoard(input.revision, (board) => {
      const ids = new Set(board.cards.map((card) => card.id))
      return { ...board, cards: [...board.cards, ...incoming.cards.filter((card) => !ids.has(card.id))] }
    })
    return Response.json(result, { headers: noCache })
  } catch (error) { return apiError(error) }
}
