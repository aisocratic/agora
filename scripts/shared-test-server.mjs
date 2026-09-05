import { randomUUID } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import { Pool } from "pg"

if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must point at an isolated test database.")
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const schema = `agora_browser_${randomUUID().replaceAll("-", "")}`
await pool.query(`CREATE SCHEMA "${schema}"`)
const url = new URL(process.env.TEST_DATABASE_URL)
url.searchParams.set("options", `-c search_path=${schema}`)
const env = { ...process.env, DATABASE_URL: url.toString(), AGORA_AUTH: "password", AGORA_ACCESS_PASSWORD: "browser-test-password-2026", AGORA_SESSION_SECRET: "browser-session-secret-2026-at-least-32", AGORA_API_TOKENS: "browser:browser-api-token-2026-at-least-32-characters", AGORA_PUBLIC_ORIGIN: "http://127.0.0.1:4290" }
let cleaned = false
async function cleanup() {
  if (cleaned) return
  cleaned = true
  await pool.query(`DROP SCHEMA "${schema}" CASCADE`)
  await pool.end()
}
const migration = spawnSync("pnpm", ["db:migrate"], { env, stdio: "inherit" })
if (migration.status !== 0) { await cleanup(); process.exit(1) }
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "4290"], { env, stdio: "inherit" })
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
child.on("exit", async (code) => { await cleanup(); process.exit(code ?? 0) })
