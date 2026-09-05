import { migrate } from "../lib/server/migrations"
import { getPool } from "../lib/server/database"

async function main() {
  const pool = getPool()
  try { await migrate(pool); console.log("Agora migrations applied.") }
  finally { await pool.end() }
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
