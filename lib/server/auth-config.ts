export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export type AuthConfig = {
  mode: "none" | "password" | "proxy"
  origin?: string
  userName: string
  tokens: { name: string; secret: string }[]
  password?: string
  sessionSecret?: string
  proxySecret?: string
  userHeader?: string
}
function invalid(): never { throw new HttpError(503, "Shared access is not configured correctly. Ask the operator to check the authentication settings.") }
export function authConfig(): AuthConfig {
  if (!process.env.DATABASE_URL) throw new HttpError(503, "Shared storage is not configured.")
  const mode = process.env.AGORA_AUTH
  if (mode !== "none" && mode !== "password" && mode !== "proxy") invalid()
  if (mode === "none" && process.env.NODE_ENV === "production") invalid()
  const rawOrigin = process.env.AGORA_PUBLIC_ORIGIN
  let origin: string | undefined
  if (rawOrigin) {
    try {
      const url = new URL(rawOrigin)
      if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || !["http:", "https:"].includes(url.protocol)) invalid()
      if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) invalid()
      origin = url.origin
    } catch { invalid() }
  }
  if (process.env.NODE_ENV === "production" && !origin) invalid()
  const userName = process.env.AGORA_USER_NAME ?? "you"
  if (!userName.trim() || userName.length > 100 || /[\x00-\x1f\x7f]/.test(userName)) invalid()
  const tokens: AuthConfig["tokens"] = []
  const entries = process.env.AGORA_API_TOKENS
  if (entries) {
    for (const entry of entries.split(",")) {
      const match = /^([a-zA-Z0-9_.-]{1,100}):([^\s:,]{32,512})$/.exec(entry.trim())
      if (!match || tokens.some((token) => token.name === match[1] || token.secret === match[2])) invalid()
      tokens.push({ name: match[1], secret: match[2] })
    }
  }
  const config: AuthConfig = { mode, origin, userName, tokens }
  if (mode === "password") {
    const password = process.env.AGORA_ACCESS_PASSWORD
    const sessionSecret = process.env.AGORA_SESSION_SECRET
    if (!password || password.length < 16 || password.length > 1024 || !sessionSecret || sessionSecret.length < 32 || sessionSecret.length > 1024 || password === sessionSecret) invalid()
    Object.assign(config, { password, sessionSecret })
  }
  if (mode === "proxy") {
    const proxySecret = process.env.AGORA_PROXY_SECRET
    const userHeader = process.env.AGORA_TRUSTED_USER_HEADER?.toLowerCase()
    if (!proxySecret || proxySecret.length < 32 || proxySecret.length > 512 || !userHeader || !/^x-[a-z0-9-]+$/.test(userHeader) || ["x-forwarded-for", "x-agora-proxy-secret", "x-forwarded-host", "x-forwarded-proto"].includes(userHeader)) invalid()
    Object.assign(config, { proxySecret, userHeader })
  }
  return config
}
