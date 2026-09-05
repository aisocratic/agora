import { acceptanceSchema, dismissalSchema, reviewSchema, submissionSchema, type SuggestionState } from "../suggestions"
import { authorizeRequest } from "./authorization"
import { apiError, readJson } from "./http"
import { acceptSuggestion, dismissSuggestion, getSuggestion, listSuggestions, requireHuman, saveSuggestionDraft, submitSuggestion } from "./suggestions-repository"
export async function handleSuggestions(request: Request, operation: "list" | "submit" | "get" | "save" | "accept" | "dismiss", id = "") {
  try {
    const principal = await authorizeRequest(request, !["list", "get"].includes(operation))
    if (["save", "accept", "dismiss"].includes(operation)) requireHuman(principal)
    let data: unknown; let status = 200
    if (operation === "list") { const url = new URL(request.url); data = await listSuggestions((url.searchParams.get("state") ?? "pending") as SuggestionState, Number(url.searchParams.get("limit") ?? 50), Number(url.searchParams.get("offset") ?? 0)) }
    else if (operation === "get") data = { suggestion: await getSuggestion(id) }
    else {
      const raw = await readJson(request)
      if (operation === "submit") { data = { suggestion: await submitSuggestion(submissionSchema.parse(raw), principal) }; status = 201 }
      else if (operation === "save") { const input = reviewSchema.parse(raw); data = { suggestion: await saveSuggestionDraft(id, input.version, input.draft, principal) } }
      else if (operation === "accept") { const input = acceptanceSchema.parse(raw); data = await acceptSuggestion(id, input.version, input.revision, input.draft, principal) }
      else { const input = dismissalSchema.parse(raw); data = { suggestion: await dismissSuggestion(id, input.version, input.note, principal) } }
    }
    return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { const response = apiError(error); response.headers.set("Cache-Control", "private, no-store"); return response }
}
