import { randomUUID } from "node:crypto"
import { test, expect } from "@playwright/test"
import { spawn } from "node:child_process"
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"

const TOKEN = "browser-api-token-2026-at-least-32-characters"
function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, input = "") {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = "", stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(input)
  })
}
test("copied and locally packed dependency-free CLI authenticates and completes board workflows", async () => {
  test.setTimeout(60000)
  const repository = process.cwd()
  const directory = await mkdtemp(join(tmpdir(), "agora-cli-"))
  const executable = join(directory, "agora.mjs")
  await copyFile(resolve("cli/agora.mjs"), executable)
  const env = { ...process.env, AGORA_CONFIG: join(directory, "config.json"), AGORA_URL: "", AGORA_TOKEN: "" }
  // Empty environment overrides are intentionally removed so saved credentials are used.
  delete (env as NodeJS.ProcessEnv).AGORA_URL
  delete (env as NodeJS.ProcessEnv).AGORA_TOKEN
  const cli = (args: string[], input = "") => run(process.execPath, [executable, ...args], directory, env, input)
  try {
    const login = await cli(["login", "--url", "http://127.0.0.1:4290", "--token-stdin"], TOKEN)
    expect(login.code).toBe(0)
    expect(login.stdout + login.stderr).not.toContain(TOKEN)
    expect((await stat(env.AGORA_CONFIG)).mode & 0o777).toBe(0o600)
    expect(JSON.parse((await cli(["whoami"])).stdout)).toMatchObject({ name: "browser", kind: "token" })
    let result = await cli(["create", "--stdin"], JSON.stringify({ title: "CLI task", description: "Context", column: "backlog", type: "task", model: "default" }))
    expect(result.code).toBe(0)
    let state = JSON.parse(result.stdout)
    const card = state.board.cards.find((card: { title: string }) => card.title === "CLI task")
    const id = card.id
    expect((await cli(["edit", id, "--title", "CLI edited"])).code).toBe(0)
    expect((await cli(["move", id, "review"])).code).toBe(0)
    expect((await cli(["comment", id, "--author", "browser"], "Review complete")).code).toBe(0)
    const fetched = JSON.parse((await cli(["get", id])).stdout)
    expect(fetched.card).toMatchObject({ title: "CLI edited", column: "review", model: "default" })
    expect(fetched.card.comments[0]).toMatchObject({ body: "Review complete", author: "browser" })
    expect((await cli(["comment", id, "--author", "someone-else"], "spoof")).code).toBe(2)
    expect((await cli(["edit", id, "--title", "Must not overwrite", "--revision", "0"])).code).toBe(4)
    expect((await cli(["edit", id, "--stdin"], JSON.stringify({ assignee: "claude", column: "todo" }))).code).toBe(0)
    const dispatchRevision = JSON.parse((await cli(["board", "--json"])).stdout).revision
    const dispatchKey = randomUUID()
    const dispatched = await cli(["dispatch", id, "--revision", String(dispatchRevision), "--idempotency-key", dispatchKey])
    expect(dispatched.code).toBe(0)
    const receipt = JSON.parse(dispatched.stdout).dispatch
    expect(receipt.status).toBe("disabled")
    expect(JSON.parse((await cli(["dispatch-status", receipt.id])).stdout).id).toBe(receipt.id)
    expect(JSON.parse((await cli(["dispatch", id, "--revision", String(dispatchRevision), "--idempotency-key", dispatchKey])).stdout).dispatch.id).toBe(receipt.id)
    const backup = join(directory, "backup.json")
    expect((await cli(["export", "--output", backup])).code).toBe(0)
    expect((await cli(["archive", id])).code).toBe(0)
    expect((await cli(["restore", id])).code).toBe(0)
    expect((await cli(["archive", id])).code).toBe(0)
    expect((await cli(["delete", id])).code).toBe(0)
    expect((await cli(["get", id])).code).toBe(2)
    expect((await cli(["import", backup])).code).toBe(0)
    result = await cli(["board", "--json"])
    state = JSON.parse(result.stdout)
    expect(state.board.cards.find((card: { id: string }) => card.id === id).title).toBe("CLI edited")
    const packed = await run("npm", ["pack", join(repository, "cli"), "--json", "--pack-destination", directory], directory, env)
    expect(packed.code).toBe(0)
    const artifact = join(directory, JSON.parse(packed.stdout)[0].filename)
    const installed = await run("npm", ["exec", "--offline", "--yes", `--package=${artifact}`, "--", "agora", "whoami"], directory, env)
    expect(installed.code).toBe(0)
    expect(JSON.parse(installed.stdout).name).toBe("browser")
    const saved = await readFile(env.AGORA_CONFIG, "utf8")
    await writeFile(env.AGORA_CONFIG, saved.replace(TOKEN, "invalid-api-token-at-least-32-characters"), { mode: 0o600 })
    expect((await cli(["board"])).code).toBe(3)
    expect((await cli(["logout"])).code).toBe(0)
    await expect(stat(env.AGORA_CONFIG)).rejects.toThrow()
  } finally { await rm(directory, { recursive: true, force: true }) }
})
