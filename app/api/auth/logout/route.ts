import { authConfig } from "@/lib/server/auth-config"
import { assertMutationOrigin } from "@/lib/server/authorization"
import { revokeSession, sessionCookie } from "@/lib/server/sessions"
import { apiError } from "@/lib/server/http"

export async function POST(request: Request) {
  try {
    const config = authConfig()
    assertMutationOrigin(request, config)
    if (config.mode === "password") await revokeSession(request, config)
    return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0), "Cache-Control": "no-store" } })
  } catch (error) { return apiError(error) }
}
