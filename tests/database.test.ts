import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { getPool } from "../lib/server/database"
import { migrate } from "../lib/server/migrations"
import { ConflictError, mutateBoard, readBoard, transactBoard } from "../lib/server/board-repository"
import { GET, POST, PUT } from "../app/api/board/route"
import { POST as comment } from "../app/api/cards/[id]/comments/route"

const databaseUrl = process.env.TEST_DATABASE_URL
describe.skipIf(!databaseUrl)("real Postgres shared board", () => {
  let admin: Pool
  let pool: Pool
  const schema = `agora_test_${randomUUID().replaceAll("-", "")}`
  const original = process.env.DATABASE_URL
  const originalAuth = process.env.AGORA_AUTH
  const draft = { title: "A task", description: "Context", column: "backlog" as const }
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl })
    // schema is generated here, never supplied by a user.
    await admin.query(`CREATE SCHEMA "${schema}"`)
    const url = new URL(databaseUrl!)
    url.searchParams.set("options", `-c search_path=${schema}`)
    process.env.DATABASE_URL = url.toString()
    process.env.AGORA_AUTH = "none"
    pool = getPool()
    await migrate(pool)
  })
  afterAll(async () => {
    await pool?.end()
    delete (globalThis as typeof globalThis & { agoraPool?: Pool }).agoraPool
    await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await admin?.end()
    if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original
    if (originalAuth === undefined) delete process.env.AGORA_AUTH; else process.env.AGORA_AUTH = originalAuth
  })
  it("applies migrations idempotently and rejects a modified migration record", async () => {
    await migrate(pool)
    expect((await readBoard(pool)).revision).toBe(0)
    const { rows } = await pool.query("SELECT sha256 FROM schema_migrations WHERE name = $1", ["001_board.sql"])
    await pool.query("UPDATE schema_migrations SET sha256 = 'changed' WHERE name = $1", ["001_board.sql"])
    await expect(migrate(pool)).rejects.toThrow("modified")
    await pool.query("UPDATE schema_migrations SET sha256 = $1 WHERE name = $2", [rows[0].sha256, "001_board.sql"])
    await pool.query("INSERT INTO schema_migrations (name, sha256) VALUES ('000_removed.sql', 'removed')")
    await expect(migrate(pool)).rejects.toThrow("removed or reordered")
    await pool.query("DELETE FROM schema_migrations WHERE name = '000_removed.sql'")
  })
  it("stores task metadata and SQL-shaped strings as data in relational rows", async () => {
    const result = await mutateBoard({ type: "create", id: "task'; DROP TABLE cards; --", draft: {
      ...draft, type: "task", assignee: "claude", effort: "high", model: "default", harness: "codex",
      prUrl: "https://github.com/example/repo/pull/1", automerge: true, needsHumanReview: false,
    } }, 0, pool)
    expect(result.revision).toBe(1)
    expect((await pool.query("SELECT count(*) FROM cards")).rows[0].count).toBe("1")
    expect(result.board.cards[0].automerge).toBe(true)
  })
  it("serializes concurrent writers and rejects the stale write without losing cards", async () => {
    const results = await Promise.allSettled([
      mutateBoard({ type: "create", id: "second", draft }, 1, pool),
      mutateBoard({ type: "create", id: "third", draft }, 1, pool),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(ConflictError)
    expect((await readBoard(pool)).board.cards).toHaveLength(2)
  })
  it("persists edits, ordering, archive/restore/delete across independent connections", async () => {
    let result = await readBoard(pool)
    const id = result.board.cards[1].id
    result = await mutateBoard({ type: "edit", id, draft: { ...draft, title: "Edited" } }, result.revision, pool)
    result = await mutateBoard({ type: "move", id, column: "todo", position: 0 }, result.revision, pool)
    result = await mutateBoard({ type: "move", id, column: "backlog", position: 0 }, result.revision, pool)
    expect(result.board.cards[0].id).toBe(id)
    const fresh = new Pool({ connectionString: process.env.DATABASE_URL })
    try { expect(await readBoard(fresh)).toEqual(await readBoard(pool)) } finally { await fresh.end() }
    await expect(mutateBoard({ type: "delete", id }, result.revision, pool)).rejects.toThrow("Archive")
    result = await mutateBoard({ type: "archive", id }, result.revision, pool)
    result = await mutateBoard({ type: "restore", id }, result.revision, pool)
    expect(result.board.cards[0].archived).toBe(false)
    result = await mutateBoard({ type: "archive", id }, result.revision, pool)
    result = await mutateBoard({ type: "delete", id }, result.revision, pool)
    expect(result.board.cards).toHaveLength(1)
  })
  it("validates dependency/parent references and cycles, retaining the old revision on failure", async () => {
    let result = await readBoard(pool)
    const first = result.board.cards[0].id
    result = await mutateBoard({ type: "create", id: "child", draft: { ...draft, parentId: first, dependencies: [first] } }, result.revision, pool)
    expect((await pool.query("SELECT count(*) FROM card_dependencies")).rows[0].count).toBe("1")
    for (const fields of [{ dependencies: ["child"] }, { parentId: "child" }, { dependencies: ["missing"] }]) {
      await expect(mutateBoard({ type: "edit", id: first, draft: { ...draft, ...fields } }, result.revision, pool)).rejects.toThrow()
      expect((await readBoard(pool)).revision).toBe(result.revision)
    }
    result = await mutateBoard({ type: "archive", id: first }, result.revision, pool)
    await expect(mutateBoard({ type: "delete", id: first }, result.revision, pool)).rejects.toThrow("references")
  })
  it("rolls back the whole transaction including future extension writes", async () => {
    const before = await readBoard(pool)
    await expect(transactBoard(before.revision, async (board, client) => {
      await client.query("UPDATE cards SET title = $1", ["Should roll back"])
      throw new Error("Extension failed")
    }, pool)).rejects.toThrow("Extension failed")
    expect(await readBoard(pool)).toEqual(before)
  })
  it("serves ETags, validates HTTP mutations and returns conflicts", async () => {
    const response = await GET(new Request("http://localhost/api/board"))
    expect(response.status).toBe(200)
    const state = await response.json()
    expect(response.headers.get("etag")).toMatch(new RegExp(`^"${state.revision}-`))
    expect((await GET(new Request("http://localhost/api/board", { headers: { "If-None-Match": response.headers.get("etag")! } }))).status).toBe(304)
    const request = (body: unknown) => new Request("http://localhost/api/board", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(body) })
    expect((await POST(request({ action: { type: "move", id: "child", column: "todo", position: -1 }, revision: state.revision }))).status).toBe(400)
    expect((await POST(request({ action: { type: "move", id: "child", column: "todo", position: 0 }, revision: 0 }))).status).toBe(409)
    expect((await POST(request({ action: { type: "move", id: "child", column: "todo", position: 0 }, revision: state.revision }))).status).toBe(200)
  })
  it("adds attributed comments via HTTP and imports additively", async () => {
    const before = await readBoard(pool)
    const response = await comment(new Request("http://localhost/api/cards/child/comments", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify({ body: "Ready for review", revision: before.revision }) }), { params: Promise.resolve({ id: "child" }) })
    expect(response.status).toBe(201)
    const state = await response.json()
    expect(state.board.cards.find((card: { id: string }) => card.id === "child").comments[0]).toMatchObject({ body: "Ready for review", author: "you" })
    expect((await pool.query("SELECT count(*) FROM card_comments")).rows[0].count).toBe("1")
    const result = await PUT(new Request("http://localhost/api/board", { method: "PUT", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify({ revision: state.revision, board: { version: 1, cards: [] } }) }))
    expect(result.status).toBe(200)
    expect((await result.json()).board.cards).toHaveLength(2)
  })
  it("rejects cross-origin mutations", async () => {
    const response = await POST(new Request("http://localhost/api/board", { method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" }, body: "{}" }))
    expect(response.status).toBe(403)
  })
})
