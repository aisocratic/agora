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

describe("agora status", async () => {
  const { planTags, renderStatus, statusGroups } = await import("../cli/agora.mjs")
  const card = (id: string, column: string, extra: Record<string, unknown> = {}) => ({ id: `${id}-0000-0000`, title: `Card ${id}`, description: "", column, archived: false, type: "task", priority: 2, assignee: "agent", updatedAt: "2026-10-20T00:00:00Z", ...extra })
  const state = {
    revision: 7,
    workflow: { columns: [
      { id: "backlog", label: "Backlog", role: "backlog" }, { id: "todo", label: "Todo", role: "todo" },
      { id: "doing", label: "In Progress", role: "doing" }, { id: "review", label: "Review", role: "review" }, { id: "done", label: "Done", role: "done" },
    ] },
    board: { cards: [
      card("a", "todo", { priority: 1 }), card("b", "todo", { priority: 3, assignee: "Fed" }), card("c", "doing"), card("d", "review", { prUrl: "https://x/1" }),
      card("e", "backlog"), card("f", "done"), card("g", "todo", { archived: true }), card("h", "todo", { type: "epic" }),
    ] },
    runnableNow: ["a-0000-0000"], gated: [{ id: "b-0000-0000" }], blocked: [{ id: "c-0000-0000" }], readyToMerge: [{ id: "d-0000-0000" }],
  }

  it("shows In Progress, Review and Todo by default, highest priority first, without archived cards or epics", () => {
    const groups = statusGroups(state)
    expect(groups.map((g: { column: string }) => g.column)).toEqual(["doing", "review", "todo"])
    expect(groups[2].cards.map((c: { id: string }) => c.id.slice(0, 1))).toEqual(["b", "a"])
  })

  it("adds Backlog with --all, takes named columns, and filters by assignee", () => {
    expect(statusGroups(state, { all: true }).map((g: { column: string }) => g.column)).toEqual(["doing", "review", "todo", "backlog"])
    expect(statusGroups(state, { columns: ["Done"] }).map((g: { column: string }) => g.column)).toEqual(["done"])
    expect(statusGroups(state, { assignee: "fed" })[2].cards).toHaveLength(1)
  })

  it("tags each card with why it can or cannot start", () => {
    const tags = planTags(state)
    expect(tags.get("a-0000-0000")).toBe("ready")
    expect(tags.get("b-0000-0000")).toBe("waiting on a person")
    expect(tags.get("d-0000-0000")).toBe("ready to merge")
  })

  it("renders columns with counts, tags and no ANSI codes when color is off", () => {
    const text = renderStatus(state, statusGroups(state), { width: 80, origin: "board.test" })
    expect(text).toContain("Agora · board.test · revision 7 · 7 cards")
    expect(text).toContain("Todo (2)  1 waiting on a person · 1 ready")
    expect(text).toContain("Card a [ready]")
    expect(text).not.toContain("\x1b[")
  })
})
