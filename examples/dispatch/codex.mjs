#!/usr/bin/env node
// Operator supplies the absolute runner path as argv[2]. No agent is launched by tests.
import { spawn } from "node:child_process"
import { isAbsolute } from "node:path"
const executable = process.argv[2]
if (!executable || !isAbsolute(executable)) throw new Error("Supply an absolute Codex CLI executable path")
let raw = ""
for await (const chunk of process.stdin) raw += chunk
const { card, dispatchId } = JSON.parse(raw)
const args = ["exec", "--sandbox", "workspace-write", "--json"]
if (card.model && card.model !== "default") args.push("--model", card.model)
args.push("-")
const child = spawn(executable, args, { stdio: ["pipe", "inherit", "inherit"], shell: false })
child.stdin.end(`Work on this assigned task. Do not merge a PR without the board's merge/review policy. Dispatch ${dispatchId}.\n${JSON.stringify(card, null, 2)}`)
child.on("error", () => { process.exitCode = 1 })
child.on("exit", (code) => { process.exitCode = code ?? 1 })
