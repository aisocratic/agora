import { afterEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { main } from "../cli/agora.mjs"
import { normalizeSuggestionDraft, submissionSchema } from "../lib/suggestions"
import { DEFAULT_WORKFLOW } from "../lib/workflow"
import { requireHuman } from "../lib/server/suggestions-repository"
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe("suggestion contracts", () => {
  it("normalizes configured destination and validates bounded task metadata without author spoofing", () => {
    const workflow = { ...DEFAULT_WORKFLOW, columns: [{ id: "queue", label: "Queue", role: "backlog" as const }] }
    expect(normalizeSuggestionDraft({ title: "  Proposal  ", type: "task", dependencies: [] }, workflow)).toMatchObject({ title: "Proposal", description: "", column: "queue" })
    expect(() => submissionSchema.parse({ draft: { title: "Valid" }, author: "someone-else" })).toThrow()
    expect(() => submissionSchema.parse({ draft: { title: "x".repeat(201) } })).toThrow()
    expect(() => submissionSchema.parse({ draft: { title: "Proposal", prUrl: "javascript:alert(1)" } })).toThrow()
  })
  it("requires a human principal for every review path", () => {
    expect(() => requireHuman({ name: "agent", kind: "token" })).toThrow("person must review")
    for (const kind of ["local", "session", "proxy"] as const) expect(() => requireHuman({ name: "reviewer", kind })).not.toThrow()
  })
  it("standalone CLI submits, lists and reads proposals through authenticated HTTP", async () => {
    vi.stubEnv("AGORA_CONFIG", `/tmp/agora-suggestions-no-config-${randomUUID()}`)
    vi.stubEnv("AGORA_URL", "http://127.0.0.1:4291")
    vi.stubEnv("AGORA_TOKEN", "suggestions-test-token-at-least-32-characters")
    const fetch = vi.fn().mockImplementation(async () => Response.json({ ok: true }))
    vi.stubGlobal("fetch", fetch); vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    await main(["suggest", "--title", "Investigate latency", "--reason", "Regression found", "--data", '{"type":"task","dependencies":["existing"]}'])
    expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:4291/api/suggestions")
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ draft: { title: "Investigate latency", description: "", type: "task", dependencies: ["existing"] }, reason: "Regression found" })
    await main(["suggestions", "list", "--state", "accepted", "--limit", "10"])
    expect(fetch.mock.calls[1][0]).toContain("state=accepted&limit=10")
    await main(["suggestions", "get", "proposal-id"])
    expect(fetch.mock.calls[2][0]).toBe("http://127.0.0.1:4291/api/suggestions/proposal-id")
    await expect(main(["suggestions", "accept", "proposal-id"])).rejects.toThrow("browser")
    await expect(main(["suggest", "--author", "spoofed"])).rejects.toThrow("not supported")
  })
})
