import type { Pool, PoolClient } from "pg"
import { BoardValidationError, parseBoard, updateBoard, type BoardAction, type BoardData } from "../board"
import { getPool, withTransaction } from "./database"
import { getPublicWorkflow } from "./configuration"
import { validateConfiguredAction } from "../configured-board"
import { taskFieldsSchema } from "../task-fields"

export type BoardEnvelope = { board: BoardData; revision: number }
export class ConflictError extends Error {
  constructor() { super("The board changed in another client. Your edit has been kept; review the latest board and save again.") }
}

async function readState(client: PoolClient): Promise<BoardData> {
  const cards = await client.query("SELECT * FROM cards ORDER BY position, id")
  const dependencies = await client.query("SELECT card_id, dependency_id FROM card_dependencies ORDER BY card_id, position")
  const comments = await client.query("SELECT * FROM card_comments ORDER BY created_at, id")
  return parseBoard(JSON.stringify({ version: 1, cards: cards.rows.map((card) => ({
    ...card.metadata,
    id: card.id, title: card.title, description: card.description,
    column: card.column_id, archived: card.archived,
    createdAt: card.created_at.toISOString(), updatedAt: card.updated_at.toISOString(),
    parentId: card.parent_id,
    dependencies: dependencies.rows.filter((row) => row.card_id === card.id).map((row) => row.dependency_id),
    comments: comments.rows.filter((row) => row.card_id === card.id).map((row) => ({
      id: row.id, body: row.body, author: row.author, createdAt: row.created_at.toISOString(),
    })),
  })) }))
}

export async function readBoard(pool: Pool = getPool()): Promise<BoardEnvelope> {
  return withTransaction(async (client) => {
    // The shared lock gives all three relational reads a consistent revision.
    const result = await client.query("SELECT revision FROM board_revision WHERE id = 1 FOR SHARE")
    if (!result.rowCount) throw new Error("Run pnpm db:migrate before using the shared board.")
    return { board: await readState(client), revision: Number(result.rows[0].revision) }
  }, pool)
}

async function persistBoard(client: PoolClient, board: BoardData) {
  // References may change together; constraints are checked at commit.
  await client.query("DELETE FROM card_dependencies")
  await client.query("DELETE FROM card_comments")
  for (const [position, card] of board.cards.entries()) {
    const { id, title, description, column, archived, createdAt, updatedAt, parentId } = card
    const metadata = taskFieldsSchema.omit({ parentId: true, dependencies: true, comments: true }).parse(card)
    await client.query(`INSERT INTO cards (id,title,description,column_id,position,archived,created_at,updated_at,parent_id,metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,
      column_id=EXCLUDED.column_id,position=EXCLUDED.position,archived=EXCLUDED.archived,
      updated_at=EXCLUDED.updated_at,parent_id=EXCLUDED.parent_id,metadata=EXCLUDED.metadata`,
    [id,title,description,column,position,archived,createdAt,updatedAt,parentId ?? null,JSON.stringify(metadata)])
  }
  await client.query("DELETE FROM cards WHERE NOT (id = ANY($1::text[]))", [board.cards.map((card) => card.id)])
  for (const card of board.cards) {
    for (const [position, id] of (card.dependencies ?? []).entries())
      await client.query("INSERT INTO card_dependencies (card_id,dependency_id,position) VALUES ($1,$2,$3)", [card.id,id,position])
    for (const comment of card.comments ?? [])
      await client.query("INSERT INTO card_comments (id,card_id,body,author,created_at) VALUES ($1,$2,$3,$4,$5)", [comment.id,card.id,comment.body,comment.author,comment.createdAt])
  }
}

export async function transactBoard(
  expectedRevision: number,
  updater: (board: BoardData, client: PoolClient) => BoardData | Promise<BoardData>,
  pool: Pool = getPool(),
): Promise<BoardEnvelope> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new BoardValidationError("A valid board revision is required.")
  return withTransaction(async (client) => {
    const result = await client.query("SELECT revision FROM board_revision WHERE id = 1 FOR UPDATE")
    if (!result.rowCount) throw new Error("Run pnpm db:migrate before using the shared board.")
    if (Number(result.rows[0].revision) !== expectedRevision) throw new ConflictError()
    const board = parseBoard(JSON.stringify(await updater(await readState(client), client)))
    await persistBoard(client, board)
    const revision = await client.query("UPDATE board_revision SET revision = revision + 1 WHERE id = 1 RETURNING revision")
    return { board, revision: Number(revision.rows[0].revision) }
  }, pool)
}

export async function mutateBoard(action: BoardAction, expectedRevision: number, pool: Pool = getPool()) {
  const workflow = await getPublicWorkflow()
  return transactBoard(expectedRevision, (board) => {
    validateConfiguredAction(board, action, workflow)
    return updateBoard(board, action)
  }, pool)
}
