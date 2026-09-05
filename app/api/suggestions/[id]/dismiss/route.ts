import { handleSuggestions } from "@/lib/server/suggestions-http"
export const runtime = "nodejs"
export const POST = async (request: Request, context: { params: Promise<{ id: string }> }) => handleSuggestions(request, "dismiss", (await context.params).id)
