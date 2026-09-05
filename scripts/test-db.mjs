import { spawnSync } from "node:child_process"
if (!process.env.TEST_DATABASE_URL) {
  console.error("Set TEST_DATABASE_URL to an isolated test database. Each run creates and removes its own schema.")
  process.exit(1)
}
const result = spawnSync("pnpm", ["exec", "vitest", "run", "tests/database.test.ts", "tests/auth-database.test.ts", "tests/dispatch-database.test.ts", "tests/suggestions-database.test.ts", "tests/planner-database.test.ts"], { stdio: "inherit" })
process.exit(result.status ?? 1)
