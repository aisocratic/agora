import { handleSuggestions } from "@/lib/server/suggestions-http"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export const GET = async (request: Request, context: Context) => handleSuggestions(request, "get", (await context.params).id)
export const PATCH = async (request: Request, context: Context) => handleSuggestions(request, "save", (await context.params).id)
