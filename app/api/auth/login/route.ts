import { z } from "zod"
import { authConfig, HttpError } from "@/lib/server/auth-config"
import { assertMutationOrigin } from "@/lib/server/authorization"
import { checkPassword, issueSession, reserveLoginAttempt, sessionCookie } from "@/lib/server/sessions"
import { apiError, readJson } from "@/lib/server/http"
import { getPool } from "@/lib/server/database"

export async function POST(request: Request) {
  try {
    const config = authConfig()
    if (config.mode !== "password") throw new HttpError(404, "Password sign-in is not enabled.")
    assertMutationOrigin(request, config)
    const input = z.object({ password: z.string().min(1).max(1024) }).strict().parse(await readJson(request))
    await reserveLoginAttempt()
    if (!await checkPassword(input.password, config)) throw new HttpError(401, "Incorrect password.")
    const token = await issueSession(config)
    await getPool().query("DELETE FROM auth_login_attempts WHERE key='password'")
    return Response.json({ name: config.userName, kind: "session" }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } })
  } catch (error) {
    const response = apiError(error)
    response.headers.set("Cache-Control", "no-store")
    if (response.status === 429) response.headers.set("Retry-After", "900")
    return response
  }
}
