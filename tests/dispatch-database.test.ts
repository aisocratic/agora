import { randomUUID } from "node:crypto"
import { createServer, type Server, type RequestListener } from "node:http"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { getPool } from "../lib/server/database"
import { migrate } from "../lib/server/migrations"
import { mutateBoard, readBoard } from "../lib/server/board-repository"
import { dispatchTask } from "../lib/server/dispatch-repository"
import { webhookSignature } from "../lib/server/dispatch-adapters"
import { DEFAULT_WORKFLOW } from "../lib/workflow"
import type { Configuration } from "../lib/server/configuration"

const databaseUrl = process.env.TEST_DATABASE_URL
const workflow = { ...DEFAULT_WORKFLOW, columns: [
  { id: "queue", label: "Queue", role: "todo" as const }, { id: "active", label: "Active", role: "doing" as const },
  { id: "finished", label: "Finished", role: "done" as const },
] }
const draft = { title: "Dispatch me", description: "Exact payload\nwith context", column: "queue", assignee: "claude", type: "task" }
const principal = { name: "operator", kind: "token" as const }
describe.skipIf(!databaseUrl)("real database configurable dispatch", () => {
  const schema = `agora_dispatch_${randomUUID().replaceAll("-", "")}`
  let admin: Pool, pool: Pool, directory: string
  let configuration: Configuration
  const servers: Server[] = []
  async function configure(dispatcher: Configuration["dispatcher"] = { type: "none" }) {
    configuration = { workflow: structuredClone(workflow), dispatcher }
    await writeFile(join(directory, "config.json"), JSON.stringify(configuration))
  }
  async function create(overrides = {}) {
    const before = await readBoard(pool)
    return mutateBoard({ type: "create", id: randomUUID(), draft: { ...draft, ...overrides } }, before.revision, pool)
  }
  async function receiver(handler: RequestListener) {
    const server = createServer(handler)
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address() as { port: number }
    return `http://127.0.0.1:${address.port}/dispatch`
  }
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl })
    await admin.query(`CREATE SCHEMA "${schema}"`)
    const url = new URL(databaseUrl!)
    url.searchParams.set("options", `-c search_path=${schema}`)
    vi.stubEnv("DATABASE_URL", url.toString())
    directory = await mkdtemp(join(tmpdir(), "agora-dispatch-"))
    vi.stubEnv("AGORA_CONFIG_FILE", join(directory, "config.json"))
    vi.stubEnv("AGORA_WEBHOOK_SECRET", "local-receiver-signing-secret-at-least-32")
    vi.stubEnv("AGORA_ALLOW_COMMAND_DISPATCH", "1")
    pool = getPool()
    await migrate(pool)
  })
  beforeEach(async () => {
    await pool.query("TRUNCATE cards, card_dependencies, card_comments, dispatches CASCADE")
    await pool.query("UPDATE board_revision SET revision=0")
    await configure()
  })
  afterAll(async () => {
    for (const server of servers) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) }
    await pool?.end()
    delete (globalThis as typeof globalThis & { agoraPool?: Pool }).agoraPool
    await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await admin?.end()
    await rm(directory, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })
  it("round-trips configured vocabulary and preserves historical values after configuration changes", async () => {
    let result = await create()
    const card = result.board.cards[0]
    configuration.workflow.columns[0] = { id: "ready", label: "Ready", role: "todo" }
    await writeFile(join(directory, "config.json"), JSON.stringify(configuration))
    expect((await readBoard(pool)).board.cards[0].column).toBe("queue")
    result = await mutateBoard({ type: "edit", id: card.id, draft: { ...draft, title: "Historical title edited" } }, result.revision, pool)
    await expect(mutateBoard({ type: "move", id: card.id, column: "unknown", position: 0 }, result.revision, pool)).rejects.toThrow("configured")
    result = await mutateBoard({ type: "move", id: card.id, column: "ready", position: 0 }, result.revision, pool)
    expect(result.board.cards[0].column).toBe("ready")
  })
  it("signs the exact webhook body and only dispatches once under concurrent retry", async () => {
    let calls = 0
    const url = await receiver(async (request, response) => {
      calls++
      let raw = ""
      for await (const chunk of request) raw += chunk.toString()
      expect(request.headers["x-agora-signature"]).toBe(webhookSignature(raw, String(request.headers["x-agora-timestamp"]), process.env.AGORA_WEBHOOK_SECRET!))
      expect(JSON.parse(raw).card.description).toBe(draft.description)
      response.writeHead(202).end("accepted")
    })
    await configure({ type: "webhook", url, secretEnv: "AGORA_WEBHOOK_SECRET", timeoutMs: 2000 })
    const state = await create()
    const key = randomUUID(), id = state.board.cards[0].id
    const results = await Promise.all([dispatchTask(id,state.revision,key,principal),dispatchTask(id,state.revision,key,principal)])
    expect(calls).toBe(1)
    expect(results[0].dispatch.id).toBe(results[1].dispatch.id)
    expect((await readBoard(pool)).board.cards[0].column).toBe("active")
    expect((await dispatchTask(id,state.revision,key,principal)).dispatch.status).toBe("succeeded")
    expect(calls).toBe(1)
  })
  it("records uncertain outbound failures and never silently replays them", async () => {
    let calls = 0
    const url = await receiver((_request, response) => { calls++; response.writeHead(500).end() })
    await configure({ type: "webhook", url, secretEnv: "AGORA_WEBHOOK_SECRET", timeoutMs: 1000 })
    const state = await create(), key = randomUUID(), id = state.board.cards[0].id
    expect((await dispatchTask(id,state.revision,key,principal)).dispatch.status).toBe("uncertain")
    expect((await dispatchTask(id,state.revision,key,principal)).dispatch.status).toBe("uncertain")
    expect(calls).toBe(1)
  })
  it("runs only an opted-in trusted executable with JSON stdin and no server secrets", async () => {
    const helper = join(directory, "receiver.mjs"), output = join(directory, "received.json")
    await writeFile(helper, 'import fs from "node:fs";let raw="";for await(const chunk of process.stdin)raw+=chunk;fs.writeFileSync(process.argv[2],JSON.stringify({payload:JSON.parse(raw),hasSecret:!!process.env.DATABASE_URL}));')
    await configure({ type: "command", executable: process.execPath, args: [helper, output], timeoutMs: 2000 })
    const state = await create(), id = state.board.cards[0].id
    vi.stubEnv("AGORA_ALLOW_COMMAND_DISPATCH", "0")
    await expect(dispatchTask(id,state.revision,randomUUID(),principal)).rejects.toMatchObject({ status: 403 })
    vi.stubEnv("AGORA_ALLOW_COMMAND_DISPATCH", "1")
    expect((await dispatchTask(id,state.revision,randomUUID(),principal)).dispatch.status).toBe("succeeded")
    expect(JSON.parse(await readFile(output,"utf8"))).toMatchObject({ hasSecret: false, payload: { card: { id } } })
  })
  it("blocks human assignments, review gates, epics and unresolved dependencies before outbound work", async () => {
    for (const overrides of [{ assignee: "you" }, { needsHumanReview: true }, { type: "epic" }]) {
      const state = await create(overrides)
      await expect(dispatchTask(state.board.cards.at(-1)!.id,state.revision,randomUUID(),principal)).rejects.toMatchObject({ status: 409 })
    }
    let state = await create()
    const parent = state.board.cards.at(-1)!.id
    state = await create({ dependencies: [parent] })
    await expect(dispatchTask(state.board.cards.at(-1)!.id,state.revision,randomUUID(),principal)).rejects.toThrow("dependencies")
    expect((await pool.query("SELECT count(*) FROM dispatches")).rows[0].count).toBe("0")
  })
})
