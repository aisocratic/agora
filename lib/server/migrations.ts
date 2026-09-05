import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import type { Pool } from "pg"
import { getPool, withTransaction } from "./database"

export async function migrate(pool: Pool = getPool()) {
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(191734, 1)")
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())")
    const directory = resolve(process.cwd(), "db/migrations")
    const names = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
    const applied = await client.query("SELECT name FROM schema_migrations ORDER BY name")
    for (const [index, row] of applied.rows.entries()) {
      if (names[index] !== row.name) throw new Error("Applied migrations were removed or reordered; only append new migrations.")
    }
    for (const name of names) {
      const sql = await readFile(resolve(directory, name), "utf8")
      const hash = createHash("sha256").update(sql).digest("hex")
      const existing = await client.query("SELECT sha256 FROM schema_migrations WHERE name = $1", [name])
      if (existing.rowCount) {
        if (existing.rows[0].sha256 !== hash) throw new Error(`Applied migration ${name} was modified; add a new migration instead.`)
        continue
      }
      await client.query(sql)
      await client.query("INSERT INTO schema_migrations (name, sha256) VALUES ($1, $2)", [name, hash])
    }
  }, pool)
}
