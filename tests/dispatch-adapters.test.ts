import { afterEach, expect, it, vi } from "vitest"
import { executeDispatcher } from "../lib/server/dispatch-adapters"
import { configurationSchema } from "../lib/server/configuration"
import { DEFAULT_WORKFLOW } from "../lib/workflow"

const payload = { version: 1 as const, dispatchId: "dispatch-test", card: { id: "a", title: "Task", description: "Context", column: "todo", archived: false, createdAt: "2026-09-05T00:00:00Z", updatedAt: "2026-09-05T00:00:00Z" } }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it("uses only the configured GitHub owner/repo/workflow/ref and one input", async () => {
  vi.stubEnv("DISPATCH_GITHUB_TOKEN", "private-token")
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ workflow_run_id: 1 }), { status: 200 }))
  vi.stubGlobal("fetch", fetch)
  await expect(executeDispatcher({ type: "github", owner: "trusted-owner", repo: "trusted-repo", workflow: "agent.yml", ref: "main", tokenEnv: "DISPATCH_GITHUB_TOKEN", timeoutMs: 1000 }, payload)).resolves.toHaveProperty("status", "succeeded")
  expect(fetch.mock.calls[0][0]).toBe("https://api.github.com/repos/trusted-owner/trusted-repo/actions/workflows/agent.yml/dispatches")
  expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { "X-GitHub-Api-Version": "2026-03-10" } })
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ref: "main", inputs: { agora: JSON.stringify(payload) } })
})
it("rejects unknown/private configuration keys and untrusted command paths", () => {
  expect(() => configurationSchema.parse({ workflow: DEFAULT_WORKFLOW, dispatcher: { type: "command", executable: "user-supplied", args: [] } })).toThrow()
  expect(() => configurationSchema.parse({ workflow: { ...DEFAULT_WORKFLOW, secret: "never-public" }, dispatcher: { type: "none" } })).toThrow()
})
it("bounds response bodies and records receiver rejection without consuming unlimited data", async () => {
  vi.stubEnv("TEST_WEBHOOK_SECRET", "test-signature-secret-at-least-32-characters")
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(65537))))
  await expect(executeDispatcher({ type: "webhook", url: "https://receiver.example", secretEnv: "TEST_WEBHOOK_SECRET", timeoutMs: 1000 }, payload)).rejects.toThrow("limit")
})
it("keeps the none adapter free of external effects", async () => {
  const fetch = vi.fn()
  vi.stubGlobal("fetch", fetch)
  expect((await executeDispatcher({ type: "none" }, payload)).status).toBe("disabled")
  expect(fetch).not.toHaveBeenCalled()
})
it("terminates a trusted command at its configured deadline", async () => {
  vi.stubEnv("AGORA_ALLOW_COMMAND_DISPATCH", "1")
  const started = Date.now()
  await expect(executeDispatcher({ type: "command", executable: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], timeoutMs: 100 }, payload)).rejects.toThrow("time/output limit")
  expect(Date.now() - started).toBeLessThan(3000)
})
