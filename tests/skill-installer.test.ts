import { mkdtemp, readFile, rm, writeFile, mkdir, symlink, link, copyFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { spawn } from "node:child_process"
import { afterEach, expect, it } from "vitest"
import { AGORA_SKILL, installSkill } from "../cli/agora.mjs"
const directories: string[] = []
async function temporary() { const path = await mkdtemp(join(tmpdir(), "agora-skill-")); directories.push(path); return path }
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })
function run(executable: string, args: string[], cwd: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: { ...process.env, AGORA_URL: "", AGORA_TOKEN: "" } })
    let stdout = "", stderr = ""
    child.stdout.on("data", (data) => { stdout += data }); child.stderr.on("data", (data) => { stderr += data })
    child.on("error", reject); child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}
it("installs the maintained skill, is idempotent, and requires explicit replacement", async () => {
  const directory = await temporary()
  const first = await installSkill(false, directory)
  expect(first.status).toBe("installed")
  expect(await readFile(first.path, "utf8")).toBe(await readFile(resolve("skills/agora/SKILL.md"), "utf8"))
  expect(AGORA_SKILL).not.toBe("")
  expect((await installSkill(false, directory)).status).toBe("unchanged")
  await writeFile(first.path, "Locally customized")
  await expect(installSkill(false, directory)).rejects.toThrow("--force")
  expect(await readFile(first.path, "utf8")).toBe("Locally customized")
  expect((await installSkill(true, directory)).status).toBe("updated")
  expect(await readFile(first.path, "utf8")).toBe(AGORA_SKILL)
})
it("rejects symlink directories and targets plus hard links even with force", async () => {
  for (const depth of [0, 1, 2, 3]) {
    const directory = await temporary(), outside = await temporary()
    const parts = [".claude", "skills", "agora", "SKILL.md"]
    const parent = join(directory, ...parts.slice(0, depth))
    await mkdir(parent, { recursive: true })
    const external = depth === 3 ? join(outside, "keep.md") : outside
    if (depth === 3) await writeFile(external, "Keep outside data")
    await symlink(external, join(parent, parts[depth]))
    await expect(installSkill(true, directory)).rejects.toThrow(/symlink|symbolic|directories/)
    if (depth === 3) expect(await readFile(external, "utf8")).toBe("Keep outside data")
  }
  const directory = await temporary(), outside = join(await temporary(), "keep.md")
  await mkdir(join(directory, ".claude/skills/agora"), { recursive: true })
  await writeFile(outside, "Hard linked data")
  await link(outside, join(directory, ".claude/skills/agora/SKILL.md"))
  await expect(installSkill(true, directory)).rejects.toThrow("hard links")
  expect(await readFile(outside, "utf8")).toBe("Hard linked data")
})
it("copied and packed executables install outside the clone without credentials or asset files", async () => {
  const directory = await temporary(), packedDirectory = await temporary()
  const executable = join(directory, "agora.mjs")
  await copyFile(resolve("cli/agora.mjs"), executable)
  const copied = await run(process.execPath, [executable, "skill", "install"], directory)
  expect(copied.code, copied.stderr).toBe(0)
  expect(await readFile(join(directory, ".claude/skills/agora/SKILL.md"), "utf8")).toBe(AGORA_SKILL)
  const pack = await run("npm", ["pack", resolve("cli"), "--json", "--pack-destination", packedDirectory], packedDirectory)
  expect(pack.code, pack.stderr).toBe(0)
  const artifact = join(packedDirectory, JSON.parse(pack.stdout)[0].filename)
  const installed = await run("npm", ["exec", "--offline", "--yes", `--package=${artifact}`, "--", "agora", "skill", "install"], packedDirectory)
  expect(installed.code, installed.stderr).toBe(0)
  expect(await readFile(join(packedDirectory, ".claude/skills/agora/SKILL.md"), "utf8")).toBe(AGORA_SKILL)
}, 15000)
