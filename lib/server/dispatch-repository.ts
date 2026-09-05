import { randomUUID } from "node:crypto"
import { updateBoard } from "../board"
import { dispatchBlockReason } from "../dispatch-policy"
import { getPool } from "./database"
import { getConfiguration } from "./configuration"
import { readBoard, transactBoard } from "./board-repository"
import { executeDispatcher, validateDispatcher, type DispatchPayload } from "./dispatch-adapters"
import { HttpError } from "./auth-config"
import type { Principal } from "./authorization"

export type DispatchRecord = { id: string; cardId: string; revision: number; status: "pending" | "succeeded" | "disabled" | "uncertain"; message: string }
function record(row: Record<string, unknown>): DispatchRecord {
  return { id: String(row.id), cardId: String(row.card_id), revision: Number(row.revision), status: row.status as DispatchRecord["status"], message: String(row.message) }
}
export async function readDispatch(id: string) {
  const result = await getPool().query("SELECT * FROM dispatches WHERE id=$1", [id])
  if (!result.rowCount) throw new HttpError(404, "Dispatch not found.")
  return record(result.rows[0])
}
export async function dispatchTask(cardId: string, revision: number, idempotencyKey: string, principal: Principal) {
  const pool = getPool()
  const existing = await pool.query("SELECT * FROM dispatches WHERE idempotency_key=$1 OR (card_id=$2 AND revision=$3)", [idempotencyKey, cardId, revision])
  if (existing.rowCount) {
    const previous = existing.rows[0]
    if (previous.card_id !== cardId || Number(previous.revision) !== revision) throw new HttpError(409, "This dispatch key belongs to a different request.")
    return { ...await readBoard(), dispatch: record(previous) }
  }
  const configuration = await getConfiguration()
  validateDispatcher(configuration.dispatcher)
  const id = randomUUID()
  let payload: DispatchPayload | undefined
  let replay: DispatchRecord | undefined
  try {
    await transactBoard(revision, async (board, client) => {
      // The revision lock serializes eligibility and the reservation with card state.
      const previous = await client.query("SELECT * FROM dispatches WHERE idempotency_key=$1 OR (card_id=$2 AND revision=$3)", [idempotencyKey, cardId, revision])
      if (previous.rowCount) { replay = record(previous.rows[0]); return board }
      const card = board.cards.find((card) => card.id === cardId)
      if (!card) throw new HttpError(404, "Card not found.")
      const reason = dispatchBlockReason(board, card, configuration.workflow)
      if (reason) throw new HttpError(409, reason)
      const disabled = configuration.dispatcher.type === "none"
      await client.query("INSERT INTO dispatches (id,idempotency_key,card_id,revision,principal,status,message) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id,idempotencyKey,cardId,revision,principal.name,disabled ? "disabled" : "pending", disabled ? "Dispatch is disabled by the operator." : "Dispatch reserved; the outbound outcome is not yet confirmed. Do not replay it."])
      payload = { version: 1, dispatchId: id, card }
      return disabled ? board : updateBoard(board, { type: "move", id: cardId, column: configuration.workflow.columns.find((column) => column.role === "doing")!.id, position: 0 })
    })
  } catch (error) {
    // A competing request may have committed the same reservation before our lock.
    const previous = await pool.query("SELECT * FROM dispatches WHERE card_id=$1 AND revision=$2", [cardId,revision])
    if (previous.rowCount) return { ...await readBoard(), dispatch: record(previous.rows[0]) }
    throw error
  }
  if (replay) return { ...await readBoard(), dispatch: replay }
  let outcome: { status: DispatchRecord["status"]; message: string }
  try { outcome = await executeDispatcher(configuration.dispatcher, payload!) }
  catch { outcome = { status: "uncertain", message: "The outbound result could not be confirmed. The task may have started. Check the receiver using this dispatch ID; this request will not be replayed automatically." } }
  await pool.query("UPDATE dispatches SET status=$2,message=$3,updated_at=now() WHERE id=$1", [id,outcome.status,outcome.message])
  return { ...await readBoard(), dispatch: await readDispatch(id) }
}
