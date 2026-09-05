import { afterEach, describe, expect, it, vi } from "vitest"
import { http, validateUrl } from "../cli/agora.mjs"

afterEach(() => vi.unstubAllGlobals())
describe("standalone CLI boundary", () => {
  const config = { url: "https://board.example", token: "a-private-token-at-least-32-characters" }
  it("validates origins and refuses credential-bearing/insecure URLs", () => {
    for (const url of ["http://public.example", "https://user:secret@example.com", "https://board.example/path", "https://board.example/?token=secret", "file:///tmp/data"])
      expect(() => validateUrl(url)).toThrow()
    expect(validateUrl("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000")
  })
  it.each([[401, 3], [403, 3], [409, 4], [400, 2], [500, 5]])("maps HTTP %s without leaking server body", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "secret should not be printed" }, { status })))
    await expect(http(config, "/api/board")).rejects.toMatchObject({ code })
    await expect(http(config, "/api/board")).rejects.not.toThrow("secret should")
  })
  it("fails safely on invalid JSON/network errors and disallows credential redirects", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("not JSON"))
    vi.stubGlobal("fetch", fetch)
    await expect(http(config, "/api/board")).rejects.toMatchObject({ code: 5 })
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error" })
    fetch.mockRejectedValue(new Error("private connection details"))
    await expect(http(config, "/api/board")).rejects.toMatchObject({ code: 5 })
    await expect(http(config, "/api/board")).rejects.not.toThrow("private")
  })
})
