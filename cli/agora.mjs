#!/usr/bin/env node
import { randomUUID } from "node:crypto"
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createInterface } from "node:readline/promises"
import { Writable } from "node:stream"

export class CliError extends Error {
  constructor(message, code = 1) { super(message); this.code = code }
}
// BEGIN EMBEDDED AGORA SKILL
export const AGORA_SKILL = "---\nname: agora\ndescription: Use the Agora HTTP CLI to select and update authorized coding tasks from a shared board, respecting dependencies, human ownership, and review or merge policy.\n---\n\nUse the installed `agora` executable (or `node /path/to/agora.mjs`). It needs a\nconfigured board URL and API token. Run `agora help` for the available commands;\nuse `agora login --url ORIGIN` or operator-provided AGORA_URL/AGORA_TOKEN when\nconnection setup is part of the request. Never put tokens in comments or logs.\n\nRead `agora board --json`. It returns board, revision, public workflow,\nreadyToMerge, waves, blocked, needsBreakdown, humanAssigned, gated, and runnableNow.\nItems include full task context, policy, prerequisites and explicit reasons.\nUse configured column IDs selected by semantic role; labels and agent names do\nnot imply behavior.\n\nFor authorized development, choose a task assigned to your declared agent identity\nfrom runnableNow (the first wave). Later waves describe future work and cannot\nstart until a fresh plan makes them runnable. Respect the user's chosen task and\nscope; if it is blocked, explain the reported reason rather than choosing unrelated\nwork. Human, unknown or unset assignments are never permission to take a task.\nA human-review gate, including an ancestor gate, must be resolved before starting.\nEpics and parents are containers. An empty epic needs breakdown, not execution.\n\nRead `agora get ID` before a mutation. Use its revision with `--revision N` for\nchanges based on that read. A conflict requires a fresh read and reconciliation;\nnever blindly overwrite, clear dependencies or reassign ownership to get past it.\nPost concise progress/results through `agora comment ID < notes.md`; the server\nassigns the authenticated author. Comments also change the revision.\n\nChoose one execution path within existing authorization:\n\n- If doing the work yourself, move the task to the configured doing column with\n  `agora move ID COLUMN --revision N`, then carry out the requested repository\n  work and relevant tests.\n- If authorized to use the configured dispatcher, generate a UUID and run\n  `agora dispatch ID --revision N --idempotency-key UUID`. Keep the receipt, key\n  and original revision. Do not also execute the task yourself. A pending or\n  uncertain outcome may already have started work: inspect\n  `agora dispatch-status DISPATCH_ID` and the receiver. Repeating the exact\n  original request retrieves the reservation; do not create a new key to force a\n  replay. Succeeded means accepted, not completed.\n\nWhen implementation and tests are ready, open a PR only within the user's and\nrepository's existing authorization. Record its URL and the configured review\ncolumn through `agora edit ID --revision N --data JSON`, for example a JSON object\nwith `prUrl` and `column`. Comment with the change, test evidence and remaining\nreview needs. Preserve assignee, dependencies, parent, gates and merge policy\nunless explicitly authorized to change them.\n\nReview-stage tasks with a PR appear in readyToMerge. `mergeAllowed` expresses the\ncard's automerge policy only; a PR URL or this classification is not approval.\nMerge automatically only when automerge is enabled, required tests/checks and\nreviews pass, no applicable human gate remains, and user/repository authorization\nallows the merge. Otherwise leave it for human review. Do not enable automerge or\nclear review gates to bypass approval. After verified completion, move to the\nconfigured done column or archive according to the board's workflow; re-read the\nplan before selecting another task.\n\nUnexpected discoveries outside the current task can be recorded with\n`agora suggest --stdin` as a JSON draft plus optional `--reason TEXT`.\nSuggestions require browser review before becoming cards; they do not authorize\nextra work. Preserve the user's task scope and existing permissions throughout.\n"
// END EMBEDDED AGORA SKILL

export async function installSkill(force = false, root = process.cwd()) {
  const base = await realpath(root)
  let directory = base
  for (const part of [".claude", "skills", "agora"]) {
    directory = join(directory, part)
    try { await mkdir(directory, { mode: 0o700 }) }
    catch (error) { if (error.code !== "EEXIST") throw error }
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== directory)
      throw new CliError("Skill directories must be real directories within the current project, without symlinks.", 2)
  }
  const target = join(directory, "SKILL.md")
  let file
  try {
    try {
      file = await open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      await file.writeFile(AGORA_SKILL)
      return { path: target, status: "installed" }
    } catch (error) { if (error.code !== "EEXIST") throw error }
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw new CliError("The skill target must be a regular file without symbolic or hard links.", 2)
    file = await open(target, constants.O_RDWR | constants.O_NOFOLLOW)
    const opened = await file.stat()
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== info.ino || opened.dev !== info.dev)
      throw new CliError("The skill target changed during installation; try again after reviewing it.", 2)
    if (await file.readFile("utf8") === AGORA_SKILL) return { path: target, status: "unchanged" }
    if (!force) throw new CliError("A different Agora skill already exists. Review it and use --force to replace it.", 2)
    await file.truncate(0)
    await file.write(AGORA_SKILL, 0, "utf8")
    return { path: target, status: "updated" }
  } finally { await file?.close() }
}
export function validateUrl(raw) {
  try {
    const url = new URL(raw)
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error()
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error()
    return url.origin
  } catch { throw new CliError("Use an HTTPS board origin, or HTTP on localhost, without credentials, path, query or fragment.", 2) }
}
function validateToken(token) {
  if (typeof token !== "string" || !/^[^\s:,]{32,512}$/.test(token)) throw new CliError("Provide a valid API token of 32–512 characters.", 2)
  return token
}
function configPath() {
  return process.env.AGORA_CONFIG ? resolve(process.env.AGORA_CONFIG) : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "agora", "config.json")
}
async function readConfig() {
  try {
    const stat = await lstat(configPath())
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new CliError("Credential file must be a regular private file (chmod 600).", 2)
    const input = JSON.parse(await readFile(configPath(), "utf8"))
    if (input.version !== 1) throw new Error()
    return { url: validateUrl(input.url), token: validateToken(input.token) }
  } catch (error) {
    if (error instanceof CliError) throw error
    if (error.code === "ENOENT") return {}
    throw new CliError("Cannot read the credential file. Run agora login to configure it.", 2)
  }
}
async function writeConfig(config) {
  const path = configPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, ...config }) + "\n", { mode: 0o600, flag: "wx" })
    await rename(temporary, path)
    await chmod(path, 0o600)
  } finally { await rm(temporary, { force: true }) }
}
async function stdinText() {
  let input = ""
  for await (const chunk of process.stdin) {
    input += chunk.toString()
    if (Buffer.byteLength(input) > 2_000_000) throw new CliError("Input exceeds 2 MB.", 2)
  }
  return input
}
async function promptToken() {
  if (!process.stdin.isTTY) return (await stdinText()).trim()
  process.stderr.write("API token (input hidden): ")
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback() } })
  const reader = createInterface({ input: process.stdin, output: muted, terminal: true })
  try { return (await reader.question("")).trim() }
  finally { reader.close(); process.stderr.write("\n") }
}
const booleanFlags = new Set(["json", "stdin", "token-stdin", "help", "force", "all", "mine", "epics", "color", "list"])
const valueFlags = new Set(["url", "token", "title", "description", "column", "data", "revision", "position", "author", "output", "idempotency-key", "reason", "state", "limit", "offset", "assignee", "search"])
function parseArgs(args) {
  const flags = {}
  const positionals = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith("--")) { positionals.push(arg); continue }
    const key = arg.slice(2)
    if (Object.hasOwn(flags, key)) throw new CliError(`Duplicate --${key}.`, 2)
    if (booleanFlags.has(key)) flags[key] = true
    else if (valueFlags.has(key) && args[i + 1] !== undefined && !args[i + 1].startsWith("--")) flags[key] = args[++i]
    else throw new CliError(`Unknown or incomplete option: ${arg}`, 2)
  }
  return { flags, positionals }
}
export async function http(config, path, method = "GET", body) {
  let response
  try {
    response = await fetch(`${config.url}${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${config.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch { throw new CliError("Cannot reach the board securely. Check the URL and connection.", 5) }
  let data
  try { data = await response.json() } catch { throw new CliError(`The server returned an invalid response (HTTP ${response.status}).`, 5) }
  if (!response.ok) {
    // Never echo remote error bodies, URLs or credentials into logs.
    if (response.status === 401 || response.status === 403) throw new CliError("Access denied. Check your API token and board configuration.", 3)
    if (response.status === 409) throw new CliError("Revision conflict. Read the current card/board, review changes, and retry explicitly.", 4)
    if (response.status === 400 || response.status === 404 || response.status === 413 || response.status === 415) throw new CliError(`Request rejected (HTTP ${response.status}). Check the card ID, fields and revision.`, 2)
    throw new CliError(`Board request failed (HTTP ${response.status}).`, 5)
  }
  return data
}
const output = (data) => process.stdout.write(JSON.stringify(data, null, 2) + "\n")
const help = `Agora — HTTP client for a shared board (Node 20.9+)\n\n  agora                                # the board: columns of cards (same as agora status)\n  agora status [--all] [--mine] [--assignee NAME] [--search TEXT] [--limit N] [--list] [--color] [--json]\n  agora ls [COLUMN...]                  # a list, e.g. agora ls doing review, agora ls done --limit 10\n  agora login --url https://board.example.com [--token-stdin]\n  agora logout\n  agora whoami\n  agora skill install [--force]         # current project .claude/skills/agora\n  agora board [--json]\n  agora get ID\n  agora create --title TEXT [--description TEXT] [--column backlog]\n  agora create --stdin                 # JSON draft on stdin\n  agora edit ID --title TEXT           # or --stdin / --data JSON\n  agora move ID COLUMN [--position N] [--revision N]\n  agora comment ID [--author NAME] < notes.md   # or --data '{\"body\":\"...\"}'\n  agora archive ID | restore ID | delete ID\n  agora dispatch ID --idempotency-key UUID [--revision N]\n  agora dispatch-status UUID\n  agora suggest --title TEXT [--description TEXT] [--reason TEXT]\n  agora suggest --stdin                # JSON draft, metadata and relations\n  agora suggestions list [--state pending|accepted|dismissed|all]\n  agora suggestions get UUID\n  agora export [--output backup.json]\n  agora import [backup.json]           # otherwise JSON stdin\n\nBoard mutations accept --revision N; stale revisions are never retried.\nUse AGORA_URL/AGORA_TOKEN for ephemeral credentials or agora login to save them.\n--json emits server JSON. --data accepts a JSON draft; --stdin reads one.\nExit codes: 2 input, 3 authentication, 4 conflict, 5 network/server.\n`
function integer(value, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new CliError(`${label} must be a nonnegative integer.`, 2)
  return Number(value)
}
async function draftInput(flags) {
  if (flags.stdin && flags.data) throw new CliError("Choose --stdin or --data.", 2)
  let draft = {}
  if (flags.stdin || flags.data) {
    try { draft = JSON.parse(flags.stdin ? await stdinText() : flags.data) } catch { throw new CliError("Expected a JSON object for the draft.", 2) }
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new CliError("Expected a JSON object for the draft.", 2)
  }
  for (const field of ["title", "description", "column"]) if (flags[field] !== undefined) draft[field] = flags[field]
  return draft
}
// ---- agora status: the board at a glance ----------------------------------
// Bare `agora` (with a board configured), `agora status` and `agora ls` print the
// cards that are moving: In Progress first, then Review and Todo (Backlog with
// --all, any column by naming it), each with its short id, priority, assignee
// and title, and, from the board's plan, whether a card is ready to start,
// waiting on a person, or blocked.
const STATUS_ROLES = ["doing", "review", "todo"]
const PRIORITY_MARK = { 1: "*  ", 2: "** ", 3: "***" }
const clean = (text) => String(text ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ")

/** Each card's plan tag: why it can or cannot start. */
export function planTags(state) {
  const tags = new Map()
  const ids = (list) => (list ?? []).map((item) => (typeof item === "string" ? item : item.id))
  for (const id of ids(state.blocked)) tags.set(id, "blocked")
  for (const id of ids(state.gated)) tags.set(id, "waiting on a person")
  for (const id of ids(state.humanAssigned)) tags.set(id, "a person's")
  for (const id of ids(state.runnableNow)) tags.set(id, "ready")
  for (const id of ids(state.readyToMerge)) tags.set(id, "ready to merge")
  return tags
}

/**
 * The cards `agora status` shows, grouped by column, with the same filters the flags take.
 * @param {any} state
 * @param {{ columns?: string[], all?: boolean, assignee?: string, search?: string, epics?: boolean }} [options]
 */
export function statusGroups(state, { columns, all = false, assignee, search, epics = false } = {}) {
  const workflow = state.workflow?.columns ?? []
  const wanted = columns?.length
    ? workflow.filter((column) => columns.some((name) => [column.id, column.label, column.role].some((key) => String(key).toLowerCase() === name.toLowerCase())))
    : workflow.filter((column) => STATUS_ROLES.includes(column.role) || (all && column.role === "backlog"))
  // In Progress, Review, Todo, Backlog, then whatever else was asked for, in board order.
  const order = (column) => { const i = ["doing", "review", "todo", "backlog"].indexOf(column.role); return i === -1 ? 10 + workflow.indexOf(column) : i }
  const tags = planTags(state)
  const byId = new Map(state.board.cards.map((card) => [card.id, card]))
  // The card's ancestors, outermost first: the breadcrumb the web board prints above a title.
  const breadcrumb = (card) => {
    const chain = []
    for (let parent = byId.get(card.parentId); parent && chain.length < 4; parent = byId.get(parent.parentId)) chain.unshift(clean(parent.title))
    return chain
  }
  const needle = search?.toLowerCase()
  return [...wanted].sort((a, b) => order(a) - order(b)).map((column) => {
    const cards = state.board.cards
      .filter((card) => card.column === column.id && !card.archived && (epics || card.type !== "epic"))
      .filter((card) => !assignee || (card.assignee ?? "").toLowerCase() === assignee.toLowerCase())
      .filter((card) => !needle || `${card.title} ${card.description ?? ""} ${card.id}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.priority ?? 2) - (a.priority ?? 2) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map((card) => ({ id: card.id, title: card.title, priority: card.priority ?? 2, assignee: card.assignee ?? null, type: card.type, prUrl: card.prUrl ?? null, tag: tags.get(card.id) ?? null, breadcrumb: breadcrumb(card) }))
    return { column: column.id, label: column.label, role: column.role, cards }
  })
}

/**
 * The text `agora status` prints. `width` trims titles to the terminal; `color` adds ANSI emphasis.
 * @param {any} state
 * @param {any[]} groups
 * @param {{ width?: number, color?: boolean, limit?: number, origin?: string }} [options]
 */
export function renderStatus(state, groups, { width = 100, color = false, limit = 20, origin = "" } = {}) {
  const bold = (text) => (color ? `\x1b[1m${text}\x1b[0m` : text)
  const dim = (text) => (color ? `\x1b[2m${text}\x1b[0m` : text)
  const live = state.board.cards.filter((card) => !card.archived)
  const head = [origin, `revision ${state.revision}`, `${live.length} cards`].filter(Boolean).join(" · ")
  const lines = [bold("Agora") + dim(` · ${head}`), ""]
  for (const group of groups) {
    // In Progress cards read "blocked" in the plan only because they are taken; the board knows no runs, so no tags there.
    const counts = new Map()
    for (const card of group.cards) if (card.tag && group.role !== "doing") counts.set(card.tag, (counts.get(card.tag) ?? 0) + 1)
    const summary = [...counts].map(([tag, n]) => `${n} ${tag}`).join(" · ")
    lines.push(bold(`${group.label} (${group.cards.length})`) + (summary ? dim(`  ${summary}`) : ""))
    // In Progress and Review are the live work: always every card. The rest stop at `limit`.
    const shown = ["doing", "review"].includes(group.role) ? group.cards : group.cards.slice(0, limit)
    for (const card of shown) {
      const prefix = `  ${card.id.slice(0, 8)}  ${PRIORITY_MARK[card.priority] ?? "   "}  ${clean(card.assignee ?? "-").slice(0, 14).padEnd(14)}  `
      const tag = card.tag && !["doing", "review"].includes(group.role) ? ` [${card.tag}]` : card.prUrl && group.role === "review" ? " [PR]" : ""
      const room = Math.max(20, width - prefix.length - tag.length)
      const title = clean(card.title)
      lines.push(dim(prefix.slice(0, 12)) + prefix.slice(12) + (title.length > room ? `${title.slice(0, room - 1)}…` : title) + dim(tag))
    }
    if (shown.length < group.cards.length) lines.push(dim(`  … ${group.cards.length - shown.length} more (agora ls ${group.column} --limit ${group.cards.length})`))
    if (!group.cards.length) lines.push(dim("  (none)"))
    lines.push("")
  }
  return lines.join("\n")
}

// The board as the web shows it: columns side by side, each card a box with its
// breadcrumb, title, and a footer of id, priority, assignee, PR and plan tag.
const ANSI = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", amber: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m" }
/** The web board's tones: column pills and plan tags. */
const COLUMN_TONE = { backlog: "dim", todo: "blue", doing: "amber", review: "magenta", done: "green" }
const TAG_TONE = { ready: "green", "waiting on a person": "amber", "a person's": "amber", blocked: "red", "ready to merge": "cyan" }
/** Short forms for a column header's summary, so it fits a column. */
const TAG_SHORT = { "waiting on a person": "waiting", "a person's": "a person's", blocked: "blocked", ready: "ready", "ready to merge": "to merge" }
const GUTTER = 2
const MIN_COLUMN = 30
const DEFAULT_PER_COLUMN = 8

/** Display width of plain text: code points (wide glyphs are rare in card titles). */
const textWidth = (text) => [...text].length
const fit = (text, width) => {
  const chars = [...text]
  return chars.length > width ? `${chars.slice(0, Math.max(0, width - 1)).join("")}…` : text + " ".repeat(width - chars.length)
}

/**
 * Greedy word wrap into at most `lines` lines of `width`, ellipsis on the last when cut.
 * @param {string} text
 * @param {number} width
 * @param {number} [lines]
 */
export function wrapText(text, width, lines = 3) {
  const words = clean(text).split(/\s+/).filter(Boolean)
  const out = []
  let line = ""
  for (let i = 0; i < words.length; i++) {
    let word = words[i]
    while (textWidth(word) > width) { // a word longer than the line is cut across lines
      if (line) { out.push(line); line = "" }
      out.push([...word].slice(0, width).join(""))
      word = [...word].slice(width).join("")
    }
    const next = line ? `${line} ${word}` : word
    if (textWidth(next) <= width) { line = next; continue }
    out.push(line)
    line = word
  }
  if (line) out.push(line)
  if (out.length <= lines) return out
  const kept = out.slice(0, lines)
  const last = [...kept[lines - 1]]
  kept[lines - 1] = `${last.slice(0, Math.min(last.length, width - 1)).join("")}…`
  return kept
}

/**
 * One card as box lines, each exactly `width` columns wide.
 * Lines are arrays of [text, tone] segments so color never upsets the padding.
 */
function cardLines(card, role, width, paint) {
  const inner = width - 4
  const row = (segments) => {
    const used = segments.reduce((sum, [text]) => sum + textWidth(text), 0)
    return paint("│ ", "dim") + segments.map(([text, tone]) => paint(text, tone)).join("") + " ".repeat(Math.max(0, inner - used)) + paint(" │", "dim")
  }
  const lines = [paint(`╭${"─".repeat(width - 2)}╮`, "dim")]
  if (card.breadcrumb?.length) lines.push(row([[fit(card.breadcrumb.join(" › "), inner).trimEnd(), "dim"]]))
  for (const line of wrapText(card.title, inner, 3)) lines.push(row([[line, "bold"]]))
  // Footer: id, priority stars, assignee, then what the plan says (no tags on In Progress: taken cards read "blocked").
  const pull = card.prUrl?.match(/\/pull\/(\d+)/)?.[1]
  const pr = card.prUrl ? (pull ? `#${pull}` : "PR") : null
  const tag = role === "doing" ? null : card.tag
  const left = [[card.id.slice(0, 8), "dim"], ["  ", null], [(PRIORITY_MARK[card.priority] ?? "   ").trim() || "-", "amber"], ["  ", null]]
  const leftWidth = left.reduce((sum, [text]) => sum + textWidth(text), 0)
  const right = [pr && [pr, "cyan"], tag && [TAG_SHORT[tag] ?? tag, TAG_TONE[tag] ?? null]].filter(Boolean)
  const rightText = right.map(([text]) => text).join(" ")
  const assigneeRoom = inner - leftWidth - (rightText ? textWidth(rightText) + 1 : 0)
  if (assigneeRoom >= 6) {
    const who = fit(clean(card.assignee ?? "-"), assigneeRoom)
    const joined = right.flatMap((segment, i) => (i ? [[" ", null], segment] : [segment]))
    lines.push(row([...left, [rightText ? `${who} ` : who.trimEnd(), null], ...joined]))
  } else {
    lines.push(row([...left, [fit(clean(card.assignee ?? "-"), inner - leftWidth).trimEnd(), null]]))
    if (rightText) lines.push(row(right.flatMap((segment, i) => (i ? [[" ", null], segment] : [segment]))))
  }
  lines.push(paint(`╰${"─".repeat(width - 2)}╯`, "dim"))
  return lines
}

/** A column's header: the pill (name, count) and a short summary of its plan tags, then a rule. */
function columnHeader(group, width, paint) {
  const counts = new Map()
  for (const card of group.cards) if (card.tag && group.role !== "doing") counts.set(card.tag, (counts.get(card.tag) ?? 0) + 1)
  const pill = ` ${clean(group.label)} `
  const count = ` ${group.cards.length}`
  let summary = [...counts].map(([tag, n]) => `${n} ${TAG_SHORT[tag] ?? tag}`).join(" · ")
  const room = width - textWidth(pill) - textWidth(count) - 2
  if (textWidth(summary) > room) summary = room > 1 ? fit(summary, room).trimEnd() : ""
  const tone = COLUMN_TONE[group.role] ?? null
  const used = textWidth(pill) + textWidth(count) + (summary ? 2 + textWidth(summary) : 0)
  return [
    paint(pill, `pill:${tone ?? ""}`) + paint(count, "dim") + (summary ? paint(`  ${summary}`, "dim") : "") + " ".repeat(Math.max(0, width - used)),
    paint("─".repeat(width), "dim"),
  ]
}

/**
 * The kanban `agora` prints: columns side by side (stacked when the terminal is too narrow),
 * cards as boxes. `limit` caps cards per column; without it the cards that fit `height` show.
 * @param {any} state
 * @param {any[]} groups
 * @param {{ width?: number, height?: number, color?: boolean, limit?: number, origin?: string }} [options]
 */
export function renderBoard(state, groups, { width = 120, height, color = false, limit, origin = "" } = {}) {
  const paint = (text, tone) => {
    if (!color || !tone || !text) return text
    if (tone.startsWith("pill:")) { const hue = tone.slice(5); return `${ANSI.bold}${hue && hue !== "dim" ? ANSI[hue] : ""}${text}${ANSI.reset}` }
    return `${ANSI[tone] ?? ""}${text}${ANSI.reset}`
  }
  const live = state.board.cards.filter((card) => !card.archived)
  const head = [origin, `revision ${state.revision}`, `${live.length} cards`].filter(Boolean).join(" · ")
  const title = paint("Agora", "bold") + paint(` · ${head}`, "dim")
  if (!groups.length) return `${title}\n`
  const stacked = groups.length > 1 && (width - GUTTER * (groups.length - 1)) / groups.length < MIN_COLUMN
  const columnWidth = stacked ? Math.max(MIN_COLUMN, Math.min(width, 100)) : Math.max(MIN_COLUMN, Math.floor((width - GUTTER * (groups.length - 1)) / groups.length))
  // Lines each column may take: the terminal height (less the title) shared out when stacked.
  const budget = height ? Math.max(8, Math.floor((height - 2) / (stacked ? groups.length : 1))) : null
  const columns = groups.map((group) => {
    const lines = columnHeader(group, columnWidth, paint)
    let shown = 0
    for (const card of group.cards) {
      if (limit !== undefined ? shown >= limit : budget ? false : shown >= DEFAULT_PER_COLUMN) break
      const box = cardLines(card, group.role, columnWidth, paint)
      // Leave a line for "+ N more" when more cards follow.
      if (limit === undefined && budget && lines.length + box.length + (shown + 1 < group.cards.length ? 1 : 0) > budget) break
      lines.push(...box)
      shown += 1
    }
    if (!group.cards.length) lines.push(paint(fit("  (none)", columnWidth), "dim"))
    else if (shown < group.cards.length) lines.push(paint(fit(`  + ${group.cards.length - shown} more`, columnWidth), "dim"))
    return lines
  })
  const out = [title, ""]
  if (stacked) {
    columns.forEach((lines, i) => { out.push(...lines); if (i < columns.length - 1) out.push("") })
  } else {
    const rows = Math.max(...columns.map((lines) => lines.length))
    const blank = " ".repeat(columnWidth)
    for (let r = 0; r < rows; r++) out.push(columns.map((lines) => lines[r] ?? blank).join(" ".repeat(GUTTER)).trimEnd())
  }
  return `${out.join("\n")}\n`
}

/**
 * Color when asked (--color, FORCE_COLOR), never with NO_COLOR, else only on a terminal.
 * @param {{ color?: unknown }} flags
 * @param {Record<string, string | undefined>} [env]
 * @param {boolean} [isTTY]
 */
export function wantsColor(flags, env = process.env, isTTY = process.stdout.isTTY) {
  if (flags.color === true) return true
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0" && env.FORCE_COLOR !== "false") return true
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false
  return Boolean(isTTY)
}

export async function main(args = process.argv.slice(2)) {
  const { flags, positionals } = parseArgs(args)
  // Bare `agora` shows the board when one is configured (saved login or AGORA_URL), else the help.
  const configured = positionals.length > 0 || flags.help || process.env.AGORA_URL || (await readConfig().catch(() => ({}))).url
  const [command = configured ? "status" : "help", id, extra] = positionals
  if (command === "help" || flags.help) { process.stdout.write(help); return }
  if (command === "skill") {
    if (id !== "install" || positionals.length !== 2 || Object.keys(flags).some((key) => !["force", "json"].includes(key)))
      throw new CliError("Use agora skill install [--force] from the target project directory.", 2)
    output(await installSkill(flags.force === true)); return
  }
  if (!["status", "ls", "login", "logout", "whoami", "board", "get", "create", "edit", "move", "comment", "archive", "restore", "delete", "export", "import", "dispatch", "dispatch-status", "suggest", "suggestions"].includes(command)) throw new CliError("Unknown command. Run agora help.", 2)
  const limits = { status: 1, ls: 20, login: 1, logout: 1, whoami: 1, board: 1, get: 2, create: 1, edit: 2, move: 3, comment: 2, archive: 2, restore: 2, delete: 2, export: 1, import: 2, dispatch: 2, "dispatch-status": 2, suggest: 1, suggestions: 3 }
  if (positionals.length > limits[command]) throw new CliError("Unexpected positional arguments. Run agora help.", 2)
  const allowed = new Set(["url", "token", "json", "help", ...({
    status: ["all", "mine", "assignee", "search", "limit", "epics", "color", "list"], ls: ["all", "mine", "assignee", "search", "limit", "epics", "color"],
    suggest: ["title", "description", "column", "data", "stdin", "reason"], suggestions: ["state", "limit", "offset"],
    login: ["token-stdin"], create: ["title", "description", "column", "data", "stdin", "revision"],
    edit: ["title", "description", "column", "data", "stdin", "revision"], move: ["position", "revision"],
    comment: ["author", "data", "revision"], archive: ["revision"], restore: ["revision"], delete: ["revision"],
    export: ["output"], import: ["stdin", "revision"], dispatch: ["revision", "idempotency-key"],
  }[command] ?? [])])
  for (const key of Object.keys(flags)) if (!allowed.has(key)) throw new CliError(`--${key} is not supported by ${command}.`, 2)
  if (command === "logout") { await rm(configPath(), { force: true }); output({ ok: true }); return }
  const saved = command === "login" ? {} : await readConfig()
  const config = { url: validateUrl(flags.url ?? process.env.AGORA_URL ?? saved.url), token: "" }
  config.token = validateToken(flags["token-stdin"] ? (await stdinText()).trim() : flags.token ?? process.env.AGORA_TOKEN ?? (config.url === saved.url ? saved.token : undefined) ?? (command === "login" ? await promptToken() : ""))
  if (command === "login") { const principal = await http(config, "/api/auth/session"); await writeConfig(config); output({ ok: true, name: principal.name }); return }
  if (command === "suggest") { output(await http(config, "/api/suggestions", "POST", { draft: { description: "", ...await draftInput(flags) }, reason: flags.reason ?? "" })); return }
  if (command === "suggestions") {
    if (id === "get") {
      if (!extra || ["state", "limit", "offset"].some(key => flags[key] !== undefined)) throw new CliError("Use agora suggestions get UUID without list filters.", 2)
      output(await http(config, `/api/suggestions/${encodeURIComponent(extra)}`)); return
    }
    if ((id && id !== "list") || extra) throw new CliError("Use agora suggestions list or agora suggestions get UUID. Review and acceptance happen in the browser.", 2)
    const state = flags.state ?? "pending", limit = integer(flags.limit ?? 50, "Limit"), offset = integer(flags.offset ?? 0, "Offset")
    if (!["pending", "accepted", "dismissed", "all"].includes(state) || limit < 1 || limit > 100 || offset > 100000) throw new CliError("Use a valid state, limit 1–100, and offset up to 100000.", 2)
    output(await http(config, `/api/suggestions?state=${state}&limit=${limit}&offset=${offset}`)); return
  }
  if (command === "whoami") { output(await http(config, "/api/auth/session")); return }
  if (["get", "edit", "move", "comment", "archive", "restore", "delete", "dispatch", "dispatch-status"].includes(command) && !id) throw new CliError("A card ID is required.", 2)
  if (command === "dispatch-status") { output(await http(config, `/api/dispatch/${encodeURIComponent(id)}`)); return }
  if (command === "get") { output(await http(config, `/api/cards/${encodeURIComponent(id)}`)); return }
  if (command === "status" || command === "ls") {
    const state = await http(config, "/api/board")
    const assignee = flags.mine ? (await http(config, "/api/auth/session")).name : flags.assignee
    const groups = statusGroups(state, { columns: command === "ls" ? positionals.slice(1) : [], all: flags.all === true, assignee, search: flags.search, epics: flags.epics === true })
    if (flags.json) { output({ revision: state.revision, groups }); return }
    const color = wantsColor(flags)
    const origin = new URL(config.url).host
    // Under `watch` stdout is no terminal, but watch passes its size in COLUMNS and LINES.
    const width = process.stdout.columns || Number(process.env.COLUMNS) || 120
    const height = process.stdout.rows || Number(process.env.LINES) || undefined
    if (command === "ls" || flags.list) {
      process.stdout.write(renderStatus(state, groups, { width, color, limit: integer(flags.limit ?? 20, "Limit"), origin }))
      return
    }
    process.stdout.write(renderBoard(state, groups, { width, height, color, limit: flags.limit === undefined ? undefined : integer(flags.limit, "Limit"), origin }))
    return
  }
  // Preserve the complete server response, including planning classifications.
  if (command === "board") {
    const state = await http(config, "/api/board")
    if (flags.json) output(state)
    else process.stdout.write(`Revision ${state.revision}\n` + state.board.cards.map((card) => `${card.id}\t${card.column}\t${card.archived ? "[archived] " : ""}${card.title}`.replace(/[\x00-\x08\x0a-\x1f\x7f-\x9f]/g, " ")).join("\n") + "\n")
    return
  }
  if (command === "export") {
    const { board } = await http(config, "/api/board")
    if (flags.output) { await writeFile(resolve(flags.output), JSON.stringify(board, null, 2) + "\n", { mode: 0o600 }); await chmod(resolve(flags.output), 0o600) }
    else output(board)
    return
  }
  let action
  let source
  if (command === "create") action = { type: "create", id: randomUUID(), draft: { description: "", column: "backlog", ...await draftInput(flags) } }
  else if (command === "edit") {
    source = await http(config, `/api/cards/${encodeURIComponent(id)}`)
    const { title, description, column } = source.card
    action = { type: "edit", id, draft: { title, description, column, ...await draftInput(flags) } }
  } else if (command === "move") {
    if (!extra) throw new CliError("A destination column is required.", 2)
    action = { type: "move", id, column: extra, position: integer(flags.position ?? 0, "Position") }
  } else if (["archive", "restore", "delete"].includes(command)) action = { type: command, id }
  const revision = flags.revision === undefined ? (source ?? await http(config, "/api/board")).revision : integer(flags.revision, "Revision")
  if (command === "dispatch") {
    if (!flags["idempotency-key"]) throw new CliError("Supply --idempotency-key UUID and reuse it when checking/retrying this exact dispatch request.", 2)
    output(await http(config, `/api/cards/${encodeURIComponent(id)}/dispatch`, "POST", { revision, idempotencyKey: flags["idempotency-key"] })); return
  }
  if (command === "comment") {
    if (flags.author) {
      const principal = await http(config, "/api/auth/session")
      if (flags.author !== principal.name) throw new CliError("--author must match the authenticated token name; comments cannot impersonate another author.", 2)
    }
    // The body comes from stdin, or from --data '{"body":"..."}' (the form Athena's agent prompt uses).
    let body
    if (flags.data !== undefined) {
      let parsed
      try { parsed = JSON.parse(flags.data) } catch { throw new CliError("Expected --data to be a JSON object with a body.", 2) }
      if (!parsed || typeof parsed !== "object" || typeof parsed.body !== "string") throw new CliError("Expected --data to be a JSON object with a body.", 2)
      body = parsed.body
    } else body = await stdinText()
    if (!body.trim()) throw new CliError("Provide comment text on stdin or with --data.", 2)
    output(await http(config, `/api/cards/${encodeURIComponent(id)}/comments`, "POST", { body, revision })); return
  }
  if (command === "import") {
    let board
    try { board = JSON.parse(id ? await readFile(resolve(id), "utf8") : await stdinText()) } catch { throw new CliError("Cannot read a JSON board backup.", 2) }
    output(await http(config, "/api/board", "PUT", { board, revision })); return
  }
  output(await http(config, "/api/board", "POST", { action, revision }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href) {
  main().catch((error) => {
    process.stderr.write(`agora: ${error instanceof CliError ? error.message : "Operation failed. Check file permissions and configuration."}\n`)
    process.exitCode = error instanceof CliError ? error.code : 1
  })
}
