import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { authorizeRequest } from "../lib/server/authorization"
import { authConfig } from "../lib/server/auth-config"
import { apiError } from "../lib/server/http"

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "configured")
  vi.stubEnv("AGORA_AUTH", "none")
  vi.stubEnv("AGORA_API_TOKENS", "robot:a-secure-token-of-at-least-32-characters")
  vi.stubEnv("AGORA_PUBLIC_ORIGIN", "")
})
afterEach(() => vi.unstubAllEnvs())
it("requires explicit auth and refuses production none, even with a token", async () => {
  vi.stubEnv("AGORA_AUTH", "")
  expect(authConfig).toThrow()
  vi.stubEnv("AGORA_AUTH", "none")
  vi.stubEnv("NODE_ENV", "production")
  await expect(authorizeRequest(new Request("http://localhost/api/board", { headers: { Authorization: "Bearer a-secure-token-of-at-least-32-characters" } }))).rejects.toMatchObject({ status: 503 })
})
it("limits local mode to loopback and never falls back from invalid credentials", async () => {
  await expect(authorizeRequest(new Request("https://public.example/api/board"))).rejects.toMatchObject({ status: 403 })
  for (const Authorization of ["Bearer wrong", "Basic abc", "Bearer"])
    await expect(authorizeRequest(new Request("http://localhost/api/board", { headers: { Authorization } }))).rejects.toMatchObject({ status: 401 })
  await expect(authorizeRequest(new Request("http://localhost/api/board", { headers: { Authorization: "Bearer a-secure-token-of-at-least-32-characters" } }))).resolves.toEqual({ name: "robot", kind: "token" })
})
it("uses actual Host in development, and a configured public origin behind a proxy", async () => {
  await expect(authorizeRequest(new Request("http://localhost:3000/api/board", { headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" } }), true)).resolves.toHaveProperty("name")
  vi.stubEnv("AGORA_AUTH", "proxy")
  vi.stubEnv("AGORA_PUBLIC_ORIGIN", "https://board.example")
  vi.stubEnv("AGORA_PROXY_SECRET", "a-proxy-shared-secret-at-least-32-characters")
  vi.stubEnv("AGORA_TRUSTED_USER_HEADER", "X-Authenticated-User")
  const headers = { "X-Authenticated-User": "alice", "X-Agora-Proxy-Secret": "a-proxy-shared-secret-at-least-32-characters", Origin: "https://board.example" }
  await expect(authorizeRequest(new Request("http://internal:3000/api/board", { headers }), true)).resolves.toEqual({ name: "alice", kind: "proxy" })
  await expect(authorizeRequest(new Request("http://internal:3000/api/board", { headers: { ...headers, "X-Agora-Proxy-Secret": "wrong", "X-Forwarded-For": "127.0.0.1" } }))).rejects.toMatchObject({ status: 401 })
  await expect(authorizeRequest(new Request("http://internal:3000/api/board", { headers: { ...headers, Origin: "https://attacker.example" } }), true)).rejects.toMatchObject({ status: 403 })
})
it("rejects malformed token configuration without exposing it", async () => {
  vi.stubEnv("AGORA_API_TOKENS", "private-secret-malformed")
  const response = await authorizeRequest(new Request("http://localhost/api/board")).catch(apiError)
  expect(response).toBeInstanceOf(Response)
  expect(await (response as Response).text()).not.toContain("private-secret")
})
it("does not expose infrastructure details", async () => {
  const result = apiError(new Error("Private database connection information"))
  expect(result.status).toBe(503)
  expect(await result.text()).not.toContain("Private")
})
