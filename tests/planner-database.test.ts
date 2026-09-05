import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { getPool } from "../lib/server/database"
import { migrate } from "../lib/server/migrations"
import { transactBoard } from "../lib/server/board-repository"
import { GET as boardGet } from "../app/api/board/route"
import { GET as planGet } from "../app/api/plan/route"
import { POST as dispatch } from "../app/api/cards/[id]/dispatch/route"
import { DEFAULT_WORKFLOW } from "../lib/workflow"
const databaseUrl = process.env.TEST_DATABASE_URL
const token = "planner-test-token-at-least-32-characters"
describe.skipIf(!databaseUrl)("real database planner API", () => {
  const schema = `agora_planner_${randomUUID().replaceAll("-", "")}`
  let admin: Pool, pool: Pool, directory: string
  const config = { workflow: structuredClone(DEFAULT_WORKFLOW), dispatcher: { type: "none" } }
  const request = (path: string, headers = {}) => new Request(`http://localhost${path}`, { headers: { Authorization: `Bearer ${token}`, ...headers } })
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl }); await admin.query(`CREATE SCHEMA "${schema}"`)
    const url = new URL(databaseUrl!); url.searchParams.set("options", `-c search_path=${schema}`)
    vi.stubEnv("DATABASE_URL", url.toString()); vi.stubEnv("AGORA_AUTH", "password")
    vi.stubEnv("AGORA_ACCESS_PASSWORD", "planner-password-long-enough"); vi.stubEnv("AGORA_SESSION_SECRET", "planner-session-secret-at-least-32-characters")
    vi.stubEnv("AGORA_PUBLIC_ORIGIN", "http://localhost"); vi.stubEnv("AGORA_API_TOKENS", `planner:${token}`)
    vi.stubEnv("NODE_ENV", "production")
    directory = await mkdtemp(join(tmpdir(), "agora-plan-")); vi.stubEnv("AGORA_CONFIG_FILE", join(directory, "config.json"))
    await writeFile(join(directory, "config.json"), JSON.stringify(config))
    pool = getPool(); await migrate(pool)
    const card = (id: string, extra = {}) => ({ id, title: id, description: "Planning context", column: "todo", archived: false, assignee: "claude", createdAt: "2026-09-05T00:00:00Z", updatedAt: "2026-09-05T00:00:00Z", ...extra })
    await transactBoard(0, () => ({ version: 1, cards: [card("first"), card("parent", { type: "epic" }), card("child", { parentId: "parent", dependencies: ["first"] }), card("later", { dependencies: ["parent"] }), card("human", { assignee: "you" }), card("human-blocked", { dependencies: ["human"] })] }), pool)
  })
  afterAll(async () => {
    await pool?.end(); delete (globalThis as typeof globalThis & { agoraPool?: Pool }).agoraPool
    await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin?.end()
    await rm(directory, { recursive: true, force: true }); vi.unstubAllEnvs()
  })
  it("protects both plan surfaces and returns actual relational waves and blockers", async () => {
    expect((await planGet(new Request("http://localhost/api/plan"))).status).toBe(401)
    const response = await boardGet(request("/api/board")), result = await response.json()
    expect(result.waves.map((wave: { id: string }[]) => wave.map((card) => card.id))).toEqual([["first"], ["child"], ["later"]])
    expect(result.humanAssigned[0].id).toBe("human"); expect(result.blocked[0].id).toBe("human-blocked")
    expect(await (await planGet(request("/api/plan"))).json()).toEqual(result)
    expect((await planGet(request("/api/plan", { "If-None-Match": response.headers.get("etag")! }))).status).toBe(304)
    const denied = await dispatch(new Request("http://localhost/api/cards/child/dispatch", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ revision: result.revision, idempotencyKey: randomUUID() }) }), { params: Promise.resolve({ id: "child" }) })
    expect(denied.status).toBe(409)
    expect((await pool.query("SELECT count(*) FROM dispatches")).rows[0].count).toBe("0")
  })
  it("changes ETag and plan when only public workflow policy changes", async () => {
    const before = await boardGet(request("/api/board")), initial = await before.json()
    config.workflow.people.find((person) => person.id === "claude")!.kind = "human"
    await writeFile(join(directory, "config.json"), JSON.stringify(config))
    const response = await planGet(request("/api/plan", { "If-None-Match": before.headers.get("etag")! })), result = await response.json()
    expect(response.status).toBe(200); expect(result.revision).toBe(initial.revision)
    expect(response.headers.get("etag")).not.toBe(before.headers.get("etag"))
    expect(result.runnableNow).toEqual([]); expect(result.humanAssigned.length).toBe(5)
  })
})
