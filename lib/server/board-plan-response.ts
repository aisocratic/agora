import { createHash } from "node:crypto"
import { authorizeRequest } from "./authorization"
import { readBoard } from "./board-repository"
import { getPublicWorkflow } from "./configuration"
import { noCache } from "./http"
import { planBoard } from "../planner"

export async function boardPlanResponse(request: Request) {
  await authorizeRequest(request)
  const result = await readBoard()
  const workflow = await getPublicWorkflow()
  const configHash = createHash("sha256").update(JSON.stringify(workflow)).digest("hex").slice(0, 12)
  const headers = { ...noCache, ETag: `"${result.revision}-${configHash}"` }
  if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers })
  return Response.json({ ...result, workflow, ...planBoard(result.board, workflow) }, { headers })
}
