import { boardPlanResponse } from "@/lib/server/board-plan-response"
import { apiError } from "@/lib/server/http"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try { return await boardPlanResponse(request) }
  catch (error) { return apiError(error) }
}
