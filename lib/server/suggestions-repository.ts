import { isDeepStrictEqual } from "node:util"
import { randomUUID } from "node:crypto"
import type { Pool, PoolClient } from "pg"
import { updateBoard, type BoardData, type CardDraft } from "../board"
import { validateConfiguredAction } from "../configured-board"
import { normalizeSuggestionDraft, type Suggestion, type SuggestionList, type SuggestionState } from "../suggestions"
import type { Workflow } from "../workflow"
import { getPool, withTransaction } from "./database"
import { ConflictError, readBoard, transactBoard, type BoardEnvelope } from "./board-repository"
import { getPublicWorkflow } from "./configuration"
import { HttpError, type Principal } from "./authorization"
interface Row { id: string; author_name: string; author_kind: Suggestion["author"]["kind"]; proposal: CardDraft; reviewed_draft: CardDraft | null; reason: string; state: SuggestionState; version: number; accepted_card_id: string | null; reviewed_by: string | null; decision_note: string; created_at: Date; updated_at: Date; reviewed_at: Date | null }
const view = (row: Row): Suggestion => ({ id: row.id, author: { name: row.author_name, kind: row.author_kind }, proposal: row.proposal, reviewedDraft: row.reviewed_draft, reason: row.reason, state: row.state, version: row.version, acceptedCardId: row.accepted_card_id, reviewedBy: row.reviewed_by, decisionNote: row.decision_note, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), reviewedAt: row.reviewed_at?.toISOString() ?? null })
export function requireHuman(principal: Principal) { if (principal.kind === "token") throw new HttpError(403, "A person must review suggestions in the browser. Agent tokens can submit and read proposals only.") }
function identity(id: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(404, "Suggestion not found.") }
function expectedVersion(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw new HttpError(400, "A valid suggestion version is required.") }
function pending(suggestion: Suggestion, version: number) {
  expectedVersion(version)
  if (suggestion.state !== "pending" || suggestion.version !== version) throw new HttpError(409, "This suggestion changed or was already reviewed. Your draft is kept; refresh the review before trying again.")
}
function validate(board: BoardData, id: string, draft: CardDraft, workflow: Workflow) {
  const action = { type: "create" as const, id, draft }; validateConfiguredAction(board, action, workflow); return updateBoard(board, action)
}
export async function getSuggestion(id: string, pool: Pool | PoolClient = getPool()): Promise<Suggestion> {
  identity(id); const result = await pool.query<Row>("SELECT * FROM suggestions WHERE id=$1", [id])
  if (!result.rows[0]) throw new HttpError(404, "Suggestion not found.")
  return view(result.rows[0])
}
async function locked(id: string, client: PoolClient) {
  identity(id); const result = await client.query<Row>("SELECT * FROM suggestions WHERE id=$1 FOR UPDATE", [id])
  if (!result.rows[0]) throw new HttpError(404, "Suggestion not found.")
  return view(result.rows[0])
}
export async function listSuggestions(state: SuggestionState | "all" = "pending", limit = 50, offset = 0, pool = getPool()): Promise<SuggestionList> {
  if (!["pending", "accepted", "dismissed", "all"].includes(state) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new HttpError(400, "Use a valid state, a limit of 1–100, and a nonnegative offset.")
  const [rows, totals] = await Promise.all([pool.query<Row>("SELECT * FROM suggestions WHERE ($1::text IS NULL OR state=$1) ORDER BY created_at DESC,id LIMIT $2 OFFSET $3", [state === "all" ? null : state, limit, offset]), pool.query<{ state: SuggestionState; count: string }>("SELECT state,count(*) FROM suggestions GROUP BY state")])
  const counts = { pending: 0, accepted: 0, dismissed: 0 }; for (const row of totals.rows) counts[row.state] = Number(row.count)
  return { suggestions: rows.rows.map(view), counts, limit, offset }
}
export async function submitSuggestion(input: { draft: unknown; reason: string }, principal: Principal, pool = getPool()): Promise<Suggestion> {
  const workflow = await getPublicWorkflow(); const draft = normalizeSuggestionDraft(input.draft, workflow); const id = randomUUID()
  if (input.reason.length > 4000) throw new HttpError(400, "The proposal reason is too long.")
  validate((await readBoard(pool)).board, id, draft, workflow)
  return withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(191734,5)")
    const count = await client.query<{ count: string }>("SELECT count(*) FROM suggestions WHERE state='pending'")
    if (Number(count.rows[0].count) >= 1000) throw new HttpError(400, "The inbox has 1000 pending suggestions. Review some before submitting more.")
    const result = await client.query<Row>("INSERT INTO suggestions(id,author_name,author_kind,proposal,reason) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *", [id, principal.name, principal.kind, JSON.stringify(draft), input.reason])
    return view(result.rows[0])
  }, pool)
}
export async function saveSuggestionDraft(id: string, version: number, input: unknown, principal: Principal, pool = getPool()): Promise<Suggestion> {
  requireHuman(principal); const workflow = await getPublicWorkflow(); const draft = normalizeSuggestionDraft(input, workflow)
  validate((await readBoard(pool)).board, id, draft, workflow)
  return withTransaction(async client => {
    pending(await locked(id, client), version)
    const result = await client.query<Row>("UPDATE suggestions SET reviewed_draft=$1::jsonb,version=version+1,updated_at=now(),reviewed_by=$2,reviewer_kind=$3 WHERE id=$4 RETURNING *", [JSON.stringify(draft), principal.name, principal.kind, id])
    return view(result.rows[0])
  }, pool)
}
export async function dismissSuggestion(id: string, version: number, note: string, principal: Principal, pool = getPool()): Promise<Suggestion> {
  requireHuman(principal); expectedVersion(version)
  if (note.length > 2000) throw new HttpError(400, "The review note is too long.")
  return withTransaction(async client => {
    const suggestion = await locked(id, client)
    if (suggestion.state === "dismissed" && suggestion.version === version + 1) return suggestion
    pending(suggestion, version)
    const result = await client.query<Row>("UPDATE suggestions SET state='dismissed',version=version+1,reviewed_at=now(),updated_at=now(),reviewed_by=$1,reviewer_kind=$2,decision_note=$3 WHERE id=$4 RETURNING *", [principal.name, principal.kind, note, id])
    return view(result.rows[0])
  }, pool)
}
export interface AcceptedSuggestion extends BoardEnvelope { suggestion: Suggestion; replayed: boolean }
class AcceptedElsewhere extends Error {}
export async function acceptSuggestion(id: string, version: number, revision: number, input: unknown, principal: Principal, pool = getPool()): Promise<AcceptedSuggestion> {
  requireHuman(principal); expectedVersion(version)
  if (!Number.isSafeInteger(revision) || revision < 0) throw new HttpError(400, "A valid board revision is required.")
  const workflow = await getPublicWorkflow(); const draft = normalizeSuggestionDraft(input, workflow)
  const replay = async (): Promise<AcceptedSuggestion | null> => {
    const suggestion = await getSuggestion(id, pool)
    if (suggestion.state === "accepted" && suggestion.version === version + 1 && isDeepStrictEqual(suggestion.reviewedDraft, draft)) return { ...await readBoard(pool), suggestion, replayed: true }
    return null
  }
  const previous = await replay(); if (previous) return previous
  let accepted: Suggestion | undefined
  try {
    const result = await transactBoard(revision, async (board, client) => {
      const suggestion = await locked(id, client)
      if (suggestion.state === "accepted" && suggestion.version === version + 1) throw new AcceptedElsewhere()
      pending(suggestion, version)
      const next = validate(board, id, draft, workflow)
      const updated = await client.query<Row>("UPDATE suggestions SET state='accepted',reviewed_draft=$1::jsonb,version=version+1,accepted_card_id=$2::text,reviewed_by=$3,reviewer_kind=$4,reviewed_at=now(),updated_at=now() WHERE id=$2::uuid RETURNING *", [JSON.stringify(draft), id, principal.name, principal.kind])
      accepted = view(updated.rows[0]); return next
    }, pool)
    return { ...result, suggestion: accepted!, replayed: false }
  } catch (error) {
    if (error instanceof ConflictError || error instanceof AcceptedElsewhere) { const repeated = await replay(); if (repeated) return repeated }
    throw error
  }
}
