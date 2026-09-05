import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { getPool } from "../lib/server/database"
import { migrate } from "../lib/server/migrations"
import { authorizeRequest } from "../lib/server/authorization"
import { authConfig } from "../lib/server/auth-config"
import { decodeSession, SESSION_SECONDS } from "../lib/server/sessions"
import { POST as login } from "../app/api/auth/login/route"
import { POST as logout } from "../app/api/auth/logout/route"
import { GET as board } from "../app/api/board/route"

const databaseUrl = process.env.TEST_DATABASE_URL
const password = "test-password-is-long-enough"
const secret = "test-session-secret-at-least-32-characters"
describe.skipIf(!databaseUrl)("real database authentication", () => {
  const schema = `agora_auth_${randomUUID().replaceAll("-", "")}`
  let admin: Pool
  let pool: Pool
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl })
    await admin.query(`CREATE SCHEMA "${schema}"`)
    const url = new URL(databaseUrl!)
    url.searchParams.set("options", `-c search_path=${schema}`)
    vi.stubEnv("DATABASE_URL", url.toString())
    vi.stubEnv("AGORA_AUTH", "password")
    vi.stubEnv("AGORA_ACCESS_PASSWORD", password)
    vi.stubEnv("AGORA_SESSION_SECRET", secret)
    vi.stubEnv("AGORA_PUBLIC_ORIGIN", "http://localhost")
    vi.stubEnv("AGORA_API_TOKENS", "robot:a-secure-test-token-at-least-32-characters")
    vi.stubEnv("NODE_ENV", "production")
    pool = getPool()
    await migrate(pool)
  })
  beforeEach(async () => { await pool.query("DELETE FROM auth_login_attempts") })
  afterAll(async () => {
    await pool?.end()
    delete (globalThis as typeof globalThis & { agoraPool?: Pool }).agoraPool
    await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await admin?.end()
    vi.unstubAllEnvs()
  })
  const attempt = (value = password, origin = "http://localhost") => login(new Request("http://localhost/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ password: value }) }))
  it("protects reads, signs in, sets secure cookies and rejects tamper/expiry", async () => {
    expect((await board(new Request("http://localhost/api/board"))).status).toBe(401)
    expect((await attempt("incorrect-password")).status).toBe(401)
    const response = await attempt()
    expect(response.status).toBe(200)
    const cookie = response.headers.get("set-cookie")!
    for (const flag of ["HttpOnly", "SameSite=Strict", "Secure", "Path=/", "Max-Age=43200"]) expect(cookie).toContain(flag)
    const pair = cookie.split(";")[0]
    const request = new Request("http://localhost/api/board", { headers: { Cookie: pair } })
    await expect(authorizeRequest(request)).resolves.toEqual({ name: "you", kind: "session" })
    const token = pair.slice(pair.indexOf("=") + 1)
    expect(decodeSession(token, authConfig(), Date.now() + (SESSION_SECONDS + 1) * 1000)).toBeNull()
    const forged = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")
    await expect(authorizeRequest(new Request("http://localhost/api/board", { headers: { Cookie: `agora_session=${forged}` } }))).rejects.toMatchObject({ status: 401 })
    await pool.query("UPDATE auth_sessions SET expires_at = now()-interval '1 second'")
    await expect(authorizeRequest(request)).rejects.toMatchObject({ status: 401 })
  })
  it("revokes logout sessions and does not fall back from invalid Bearer", async () => {
    const response = await attempt()
    const Cookie = response.headers.get("set-cookie")!.split(";")[0]
    await expect(authorizeRequest(new Request("http://localhost/api/board", { headers: { Cookie, Authorization: "Bearer invalid" } }))).rejects.toMatchObject({ status: 401 })
    expect((await logout(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { Cookie, Origin: "https://evil.example" } }))).status).toBe(403)
    const out = await logout(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { Cookie, Origin: "http://localhost" } }))
    expect(out.status).toBe(200)
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0")
    await expect(authorizeRequest(new Request("http://localhost/api/board", { headers: { Cookie } }))).rejects.toMatchObject({ status: 401 })
  })
  it("enforces CSRF on login and session writes, but supports HTTP Bearer clients", async () => {
    expect((await attempt(password, "https://evil.example")).status).toBe(403)
    const response = await attempt()
    const Cookie = response.headers.get("set-cookie")!.split(";")[0]
    await expect(authorizeRequest(new Request("http://localhost/api/board", { headers: { Cookie } }), true)).rejects.toMatchObject({ status: 403 })
    await expect(authorizeRequest(new Request("http://localhost/api/board", { headers: { Authorization: "Bearer a-secure-test-token-at-least-32-characters" } }), true)).resolves.toEqual({ name: "robot", kind: "token" })
  })
  it("shares the rate limit across requests and recovers after the window", async () => {
    for (let i = 0; i < 10; i++) expect((await attempt("wrong-password")).status).toBe(401)
    const limited = await attempt()
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("900")
    await pool.query("UPDATE auth_login_attempts SET started_at=now()-interval '16 minutes'")
    expect((await attempt()).status).toBe(200)
  })
})
