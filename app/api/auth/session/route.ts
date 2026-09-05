import { authorizeRequest } from "@/lib/server/authorization"
import { apiError } from "@/lib/server/http"

export async function GET(request: Request) {
  try { return Response.json(await authorizeRequest(request), { headers: { "Cache-Control": "no-store" } }) }
  catch (error) { return apiError(error) }
}
