import { handleSuggestions } from "@/lib/server/suggestions-http"
export const runtime = "nodejs"
export const GET = (request: Request) => handleSuggestions(request, "list")
export const POST = (request: Request) => handleSuggestions(request, "submit")
