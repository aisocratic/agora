import { createHmac } from "node:crypto"
import { execFile } from "node:child_process"
import type { BoardCard } from "../board"
import type { Configuration } from "./configuration"
import { HttpError } from "./auth-config"

export type DispatchPayload = { version: 1; dispatchId: string; card: BoardCard }
export function webhookSignature(body: string, timestamp: string, secret: string) {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`
}
export function validateDispatcher(config: Configuration["dispatcher"]) {
  if (config.type === "command" && process.env.AGORA_ALLOW_COMMAND_DISPATCH !== "1") throw new HttpError(403, "Command dispatch requires the operator's explicit opt-in.")
  if (config.type === "webhook" && (process.env[config.secretEnv]?.length ?? 0) < 32) throw new HttpError(503, "The webhook signing secret is not configured.")
  if (config.type === "github" && !process.env[config.tokenEnv]) throw new HttpError(503, "The GitHub credential is not configured.")
}
async function consume(response: Response) {
  const reader = response.body?.getReader()
  let bytes = 0
  if (reader) for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.length
    if (bytes > 65536) { await reader.cancel(); throw new Error("The receiver response exceeded its limit.") }
  }
  if (!response.ok) throw new Error(`Receiver returned HTTP ${response.status}.`)
}
export async function executeDispatcher(config: Configuration["dispatcher"], payload: DispatchPayload) {
  validateDispatcher(config)
  if (config.type === "none") return { status: "disabled" as const, message: "Dispatch is disabled by the operator." }
  const body = JSON.stringify(payload)
  if (config.type === "command") {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(config.executable, config.args, {
        cwd: config.cwd, timeout: config.timeoutMs, killSignal: "SIGKILL", maxBuffer: 65536, shell: false,
        // Do not pass database/auth credentials to the runner's environment.
        env: { NODE_ENV: "production", PATH: process.env.PATH, LANG: process.env.LANG, AGORA_DISPATCH_ID: payload.dispatchId },
      }, (error) => error ? reject(new Error("The command failed or exceeded its time/output limit.")) : resolve())
      child.stdin?.on("error", () => { /* execFile callback reports process failure. */ })
      child.stdin?.end(body)
    })
  } else if (config.type === "webhook") {
    const timestamp = String(Math.floor(Date.now() / 1000))
    await consume(await fetch(config.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(config.timeoutMs), headers: {
      "Content-Type": "application/json", "X-Agora-Timestamp": timestamp,
      "X-Agora-Signature": webhookSignature(body, timestamp, process.env[config.secretEnv]!), "Idempotency-Key": payload.dispatchId,
    }, body }))
  } else {
    const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(config.workflow)}/dispatches`
    await consume(await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(config.timeoutMs), headers: {
      Authorization: `Bearer ${process.env[config.tokenEnv]}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10",
    }, body: JSON.stringify({ ref: config.ref, inputs: { agora: body } }) }))
  }
  return { status: "succeeded" as const, message: "The dispatcher accepted the task. Acceptance does not mean the task is complete." }
}
