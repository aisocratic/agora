import { Pool, type PoolClient } from "pg"

const globalDatabase = globalThis as typeof globalThis & { agoraPool?: Pool }
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the shared board.")
  const max = Number(process.env.DATABASE_POOL_MAX ?? 10)
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error("DATABASE_POOL_MAX must be an integer between 1 and 100.")
  if (globalDatabase.agoraPool) return globalDatabase.agoraPool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : undefined,
  })
  pool.on("error", () => console.error("Agora database connection failed."))
  globalDatabase.agoraPool = pool
  return pool
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>, pool = getPool()): Promise<T> {
  const client = await pool.connect()
  let broken = false
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    try { await client.query("ROLLBACK") } catch { broken = true }
    throw error
  } finally {
    client.release(broken)
  }
}
