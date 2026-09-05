import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Pool } from "pg"
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest"
import { getPool } from "../lib/server/database"
import { migrate } from "../lib/server/migrations"
import { mutateBoard, readBoard } from "../lib/server/board-repository"
import { acceptSuggestion, dismissSuggestion, getSuggestion, listSuggestions, saveSuggestionDraft, submitSuggestion } from "../lib/server/suggestions-repository"
import { handleSuggestions } from "../lib/server/suggestions-http"
import { DEFAULT_WORKFLOW } from "../lib/workflow"
const databaseUrl = process.env.TEST_DATABASE_URL
const human = { name: "reviewer", kind: "session" as const }, agent = { name: "proposal-agent", kind: "token" as const }
const draft = { title: "Improve query speed", description: "Inspect the query and add an index.", column: "backlog", type: "task" }
describe.skipIf(!databaseUrl)("real PostgreSQL suggestions", () => {
  const schema = `agora_suggestions_${randomUUID().replaceAll("-", "")}`
  let admin: Pool, pool: Pool, directory: string
  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/test|roadmap/.test(url.pathname)) throw new Error("Suggestions tests require a loopback test database.")
    admin = new Pool({ connectionString: databaseUrl }); await admin.query(`CREATE SCHEMA "${schema}"`)
    url.searchParams.set("options", `-c search_path=${schema}`); vi.stubEnv("DATABASE_URL", url.toString())
    vi.stubEnv("AGORA_AUTH", "none"); vi.stubEnv("AGORA_PUBLIC_ORIGIN", "http://localhost"); vi.stubEnv("AGORA_API_TOKENS", "proposal-agent:suggestions-test-token-at-least-32-characters")
    directory = await mkdtemp(join(tmpdir(), "agora-suggestion-config-")); vi.stubEnv("AGORA_CONFIG_FILE", join(directory, "config.json"))
    await writeFile(join(directory, "config.json"), JSON.stringify({ workflow: DEFAULT_WORKFLOW, dispatcher: { type: "none" } }))
    pool = getPool(); await migrate(pool)
  })
  beforeEach(async () => { await pool.query("TRUNCATE suggestions,cards,card_dependencies,card_comments CASCADE"); await pool.query("UPDATE board_revision SET revision=0") })
  afterAll(async () => { await pool?.end(); delete (globalThis as typeof globalThis & { agoraPool?: Pool }).agoraPool; await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin?.end(); await rm(directory, { recursive: true, force: true }); vi.unstubAllEnvs() })
  const submit = () => submitSuggestion({ draft, reason: "Observed slow requests" }, agent, pool)
  it("keeps authenticated attribution, original proposal and versioned reviewed draft/history", async () => {
    const suggestion = await submit(); expect(suggestion.author).toEqual(agent)
    const saved = await saveSuggestionDraft(suggestion.id, 1, { ...draft, title: "Reviewed title" }, human, pool)
    expect(saved.version).toBe(2); expect(saved.proposal.title).toBe(draft.title); expect(saved.reviewedDraft!.title).toBe("Reviewed title")
    const accepted = await acceptSuggestion(suggestion.id, 2, 0, saved.reviewedDraft, human, pool)
    expect(accepted.suggestion.state).toBe("accepted"); expect(accepted.suggestion.reviewedBy).toBe("reviewer"); expect(accepted.board.cards[0].id).toBe(suggestion.id)
    const history = await listSuggestions("accepted", 50, 0, pool); expect(history.counts).toEqual({ pending: 0, accepted: 1, dismissed: 0 })
    expect((await getSuggestion(suggestion.id, pool)).proposal.title).toBe(draft.title)
  })
  it("concurrent identical accepts are idempotent and different drafts cannot masquerade as retries", async () => {
    const suggestion = await submit()
    const results = await Promise.all([acceptSuggestion(suggestion.id, 1, 0, draft, human, pool), acceptSuggestion(suggestion.id, 1, 0, draft, human, pool)])
    expect(new Set(results.map(result => result.suggestion.acceptedCardId)).size).toBe(1)
    expect((await readBoard(pool)).revision).toBe(1); expect((await readBoard(pool)).board.cards).toHaveLength(1)
    expect((await acceptSuggestion(suggestion.id, 1, 0, draft, human, pool)).replayed).toBe(true)
    await expect(acceptSuggestion(suggestion.id, 1, 0, { ...draft, title: "Different intent" }, human, pool)).rejects.toThrow()
  })
  it("accept versus dismiss yields one decision and no duplicate card; repeat dismissal is safe", async () => {
    const suggestion = await submit()
    const results = await Promise.allSettled([acceptSuggestion(suggestion.id, 1, 0, draft, human, pool), dismissSuggestion(suggestion.id, 1, "Not needed", human, pool)])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    const reviewed = await getSuggestion(suggestion.id, pool); expect(reviewed.version).toBe(2)
    expect((await readBoard(pool)).board.cards.length).toBe(reviewed.state === "accepted" ? 1 : 0)
    const second = await submit(); await dismissSuggestion(second.id, 1, "Duplicate", human, pool)
    expect((await dismissSuggestion(second.id, 1, "Duplicate", human, pool)).version).toBe(2)
  })
  it("checks board and suggestion revisions and revalidates relations/configuration at acceptance", async () => {
    const suggestion = await submit()
    const board = await mutateBoard({ type: "create", id: "parent", draft }, 0, pool)
    await expect(acceptSuggestion(suggestion.id, 1, 0, draft, human, pool)).rejects.toThrow("board changed")
    await expect(acceptSuggestion(suggestion.id, 99, board.revision, draft, human, pool)).rejects.toMatchObject({ status: 409 })
    await expect(acceptSuggestion(suggestion.id, 1, board.revision, { ...draft, parentId: "missing" }, human, pool)).rejects.toThrow("reference")
    await expect(acceptSuggestion(suggestion.id, 1, board.revision, { ...draft, model: "unknown-model" }, human, pool)).rejects.toThrow("configured")
    const result = await acceptSuggestion(suggestion.id, 1, board.revision, { ...draft, parentId: "parent", dependencies: ["parent"], assignee: "codex", model: "default" }, human, pool)
    expect(result.board.cards[1].dependencies).toEqual(["parent"])
  })
  it("rolls back the suggestion decision if card persistence fails", async () => {
    const suggestion = await submit()
    await pool.query("ALTER TABLE cards ADD CONSTRAINT reject_acceptance_test CHECK(title <> 'Blocked title')")
    try { await expect(acceptSuggestion(suggestion.id, 1, 0, { ...draft, title: "Blocked title" }, human, pool)).rejects.toThrow() }
    finally { await pool.query("ALTER TABLE cards DROP CONSTRAINT reject_acceptance_test") }
    expect((await getSuggestion(suggestion.id, pool)).state).toBe("pending"); expect((await readBoard(pool)).revision).toBe(0)
    expect((await readBoard(pool)).board.cards).toHaveLength(0)
  })
  it("allows token submission but rejects all token review and spoofed authors before mutations", async () => {
    const headers = { Authorization: "Bearer suggestions-test-token-at-least-32-characters", "Content-Type": "application/json" }
    const response = await handleSuggestions(new Request("http://localhost/api/suggestions", { method: "POST", headers, body: JSON.stringify({ draft }) }), "submit")
    expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toContain("no-store")
    const { suggestion } = await response.json(); expect(suggestion.author).toEqual(agent)
    for (const operation of ["save", "accept", "dismiss"] as const) expect((await handleSuggestions(new Request("http://localhost/api/suggestions", { method: "POST", headers, body: "{}" }), operation, suggestion.id)).status).toBe(403)
    const spoofed = await handleSuggestions(new Request("http://localhost/api/suggestions", { method: "POST", headers, body: JSON.stringify({ draft, author: "reviewer" }) }), "submit"); expect(spoofed.status).toBe(400)
    await expect(acceptSuggestion(suggestion.id, 1, 0, draft, agent, pool)).rejects.toMatchObject({ status: 403 })
    const missingOrigin = await handleSuggestions(new Request("http://localhost/api/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), "dismiss", suggestion.id); expect(missingOrigin.status).toBe(403)
  })
})
