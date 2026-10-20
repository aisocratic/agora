import { afterEach, describe, expect, it, vi } from "vitest"
import { http, validateUrl } from "../cli/agora.mjs"
import { planTags as planTagsBoard, renderBoard, statusGroups as statusGroupsBoard, wantsColor, wrapText } from "../cli/agora.mjs"

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

describe("agora comment", () => {
  it("accepts --data, the form Athena's agent prompt uses", async () => {
    const { spawnSync } = await import("node:child_process")
    const result = spawnSync(process.execPath, ["cli/agora.mjs", "comment", "card-1", "--data", '{"body":"hi"}'], {
      env: { ...process.env, AGORA_URL: "http://127.0.0.1:9", AGORA_TOKEN: "t".repeat(40), AGORA_CONFIG: "/nonexistent" },
      encoding: "utf8",
    })
    // Flag validation fails with exit 2; getting past it means only the (absent) server is missing.
    expect(result.stderr).not.toContain("is not supported by comment")
    expect(result.status).not.toBe(2)
  })
})

describe("agora board view", () => {
  const card = (id: string, column: string, extra: Record<string, unknown> = {}) => ({ id: `${id}-0000-0000`, title: `Card ${id}`, column, archived: false, type: "task", priority: 2, assignee: "agent", updatedAt: "2026-10-20", ...extra })
  const state = {
    revision: 3,
    workflow: { columns: [{ id: "backlog", label: "Backlog", role: "backlog" }, { id: "todo", label: "Todo", role: "todo" }, { id: "doing", label: "In Progress", role: "doing" }, { id: "review", label: "Review", role: "review" }] },
    board: { cards: [
      card("p", "todo", { type: "epic", title: "Fed jobs" }),
      card("a", "todo", { parentId: "p-0000-0000", priority: 3, title: "Apply to a company with a rather long title that has to wrap across several lines in a narrow card" }),
      card("b", "todo"), card("c", "todo"), card("d", "todo"),
      card("r", "review", { prUrl: "https://github.com/o/r/pull/829" }),
      card("g", "doing"),
    ] },
    runnableNow: ["b-0000-0000"], gated: [{ id: "a-0000-0000" }], readyToMerge: [{ id: "r-0000-0000" }],
  }
  const groups = () => statusGroupsBoard(state)

  it("draws each card as a rounded box with its breadcrumb, wrapped title and footer", () => {
    const text = renderBoard(state, groups(), { width: 120, origin: "board.test" })
    expect(text).toContain("╭")
    expect(text).toContain("╯")
    expect(text).toContain("│ Fed jobs")
    expect(text).toMatch(/a-0000-0  \*\*\*  agent\s+waiting │/)
    expect(text).toContain("#829 to merge")
    // Columns sit side by side: one line holds all three headers.
    expect(text.split("\n").some((line) => line.includes("In Progress") && line.includes("Review") && line.includes("Todo"))).toBe(true)
    expect(text).not.toContain("\x1b[")
  })

  it("wraps titles to the card and cuts them with an ellipsis", () => {
    const lines = wrapText("one two three four five six seven eight nine ten", 10, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith("…")).toBe(true)
    expect(lines.every((line: string) => [...line].length <= 10)).toBe(true)
  })

  it("keeps every line of a card the same width", () => {
    const todoOnly = statusGroupsBoard(state, { columns: ["todo"] })
    const text = renderBoard(state, todoOnly, { width: 40 })
    const box = text.split("\n").filter((line) => /^[╭│╰]/.test(line))
    expect(box.length).toBeGreaterThan(4)
    expect(new Set(box.map((line) => [...line].length))).toEqual(new Set([40]))
  })

  it("stacks the columns on a narrow terminal", () => {
    const text = renderBoard(state, groups(), { width: 70 })
    const lines = text.split("\n")
    expect(lines.some((line) => line.includes("In Progress") && line.includes("Todo"))).toBe(false)
    expect(lines.findIndex((line) => line.includes(" Todo "))).toBeGreaterThan(lines.findIndex((line) => line.includes(" Review ")))
  })

  it("shows + N more past the limit or the terminal height", () => {
    expect(renderBoard(state, groups(), { width: 120, limit: 1 })).toContain("+ 3 more")
    expect(renderBoard(state, groups(), { width: 120, height: 14 })).toMatch(/\+ \d+ more/)
  })

  it("colors only when asked or on a terminal", () => {
    expect(wantsColor({}, {}, false)).toBe(false)
    expect(wantsColor({}, {}, true)).toBe(true)
    expect(wantsColor({}, { NO_COLOR: "1" }, true)).toBe(false)
    expect(wantsColor({ color: true }, { NO_COLOR: "1" }, false)).toBe(true)
    expect(wantsColor({}, { FORCE_COLOR: "1" }, false)).toBe(true)
    expect(renderBoard(state, groups(), { width: 120, color: true })).toContain("\x1b[")
    expect(planTagsBoard(state).get("b-0000-0000")).toBe("ready")
  })
})
