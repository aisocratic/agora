import { authorizeRequest, HttpError } from "@/lib/server/authorization"
import { readBoard } from "@/lib/server/board-repository"
import { apiError, noCache } from "@/lib/server/http"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await authorizeRequest(request)
    const { id } = await context.params
    const { board, revision } = await readBoard()
    const card = board.cards.find((card) => card.id === id)
    if (!card) throw new HttpError(404, "Card not found.")
    return Response.json({ card, revision }, { headers: noCache })
  } catch (error) { return apiError(error) }
}
