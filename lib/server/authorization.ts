import { createHash, timingSafeEqual } from "node:crypto"
import { verifySession } from "./sessions"
import { authConfig, HttpError, type AuthConfig } from "./auth-config"
export { HttpError } from "./auth-config"

export type Principal = { name: string; kind: "local" | "session" | "token" | "proxy" }
export function constantTimeEqual(left: string, right: string) {
  return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest())
}
export function requestOrigin(request: Request, config: AuthConfig) {
  if (config.origin) return config.origin
  const target = new URL(request.url)
  return `${target.protocol}//${request.headers.get("host") ?? target.host}`
}
export function assertMutationOrigin(request: Request, config: AuthConfig, required = true) {
  const origin = request.headers.get("origin")
  if ((required && !origin) || (origin && origin !== requestOrigin(request, config)) || request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "A same-origin request is required.")
}
export async function authorizeRequest(request: Request, mutation = false): Promise<Principal> {
  const config = authConfig()
  // Explicit invalid credentials never fall back to cookies, proxy or local mode.
  const authorization = request.headers.get("authorization")
  if (authorization !== null) {
    const match = /^Bearer ([^\s]+)$/.exec(authorization)
    if (!match) throw new HttpError(401, "Invalid API token.")
    let name: string | undefined
    for (const token of config.tokens) if (constantTimeEqual(match[1], token.secret)) name = token.name
    if (!name) throw new HttpError(401, "Invalid API token.")
    if (mutation) assertMutationOrigin(request, config, false)
    return { name, kind: "token" }
  }
  if (mutation) assertMutationOrigin(request, config)
  if (config.mode === "none") {
    const origin = new URL(requestOrigin(request, config))
    if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new HttpError(403, "Local mode requires a loopback host.")
    return { name: config.userName, kind: "local" }
  }
  if (config.mode === "proxy") {
    const secret = request.headers.get("x-agora-proxy-secret") ?? ""
    const name = request.headers.get(config.userHeader!)?.trim()
    if (!constantTimeEqual(secret, config.proxySecret!) || !name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) throw new HttpError(401, "Trusted proxy authentication required.")
    return { name, kind: "proxy" }
  }
  const name = await verifySession(request, config)
  if (!name) throw new HttpError(401, "Sign in to access the shared board.")
  return { name, kind: "session" }
}
