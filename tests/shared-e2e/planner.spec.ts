import { randomUUID } from "node:crypto"
import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawn } from "node:child_process"
import { expect, test } from "@playwright/test"
const token = "browser-api-token-2026-at-least-32-characters"
test("copied CLI receives live planning waves and only current prerequisites can dispatch", async ({ request }) => {
  const headers = { Authorization: `Bearer ${token}` }
  const create = async (id: string, dependencies: string[] = []) => {
    const state = await (await request.get("/api/board", { headers })).json()
    const response = await request.post("/api/board", { headers, data: { revision: state.revision, action: { type: "create", id, draft: { title: id, description: "Planner integration", column: "todo", assignee: "claude", dependencies } } } })
    expect(response.ok()).toBe(true)
  }
  const first = randomUUID(), later = randomUUID()
  await create(first); await create(later, [first])
  const directory = await mkdtemp(join(tmpdir(), "agora-plan-cli-")), executable = join(directory, "agora.mjs")
  await copyFile(resolve("cli/agora.mjs"), executable)
  try {
    const result = await new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [executable, "board", "--json"], { cwd: directory, env: { ...process.env, AGORA_URL: "http://127.0.0.1:4290", AGORA_TOKEN: token } })
      let stdout = ""; child.stdout.on("data", (chunk) => { stdout += chunk })
      child.on("error", reject); child.on("close", (code) => resolve({ code, stdout }))
    })
    expect(result.code).toBe(0)
    const plan = JSON.parse(result.stdout)
    expect(plan.runnableNow).toContain(first); expect(plan.runnableNow).not.toContain(later)
    expect(plan.waves[1].map((card: { id: string }) => card.id)).toContain(later)
    expect((await request.post(`/api/cards/${later}/dispatch`, { headers, data: { revision: plan.revision, idempotencyKey: randomUUID() } })).status()).toBe(409)
    expect((await request.post("/api/board", { headers, data: { revision: plan.revision, action: { type: "archive", id: first } } })).ok()).toBe(true)
    const next = await (await request.get("/api/plan", { headers })).json()
    expect(next.runnableNow).toContain(later)
    expect(next.completed).toContain(first)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
