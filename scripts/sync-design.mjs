#!/usr/bin/env node
// Refresh both consumers from a built Stoa checkout; clean installs need no sibling repo.
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
if (!process.argv[2]) throw new Error("Usage: pnpm design:sync /path/to/stoa (run pnpm build there first)")
const source = resolve(process.argv[2])
const pkg = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"))
if (pkg.name !== "@aisocratic/design") throw new Error("Expected @aisocratic/design")
await readFile(resolve(source, "dist/css/site.css"))
const temporary = await mkdtemp(resolve(tmpdir(), "agora-design-"))
try {
  execFileSync("pnpm", ["pack", "--pack-destination", temporary], { cwd: source, stdio: "inherit" })
  const archives = (await readdir(temporary)).filter((name) => name.endsWith(".tgz"))
  if (archives.length !== 1) throw new Error("Expected one packed design archive")
  const archive = archives[0]
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim()
  await mkdir(resolve(root, "vendor"), { recursive: true })
  await copyFile(resolve(temporary, archive), resolve(root, "vendor", archive))
  const manifestPath = resolve(root, "package.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  manifest.dependencies[pkg.name] = `file:vendor/${archive}`
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
  const sha256 = createHash("sha256").update(await readFile(resolve(root, "vendor", archive))).digest("hex")
  await writeFile(resolve(root, "vendor/design.json"), JSON.stringify({ package: pkg.name, version: pkg.version, sourceCommit, archive, sha256 }, null, 2) + "\n")
  execFileSync(process.execPath, [resolve(root, "site/scripts/sync-design.mjs"), source], { cwd: root, stdio: "inherit" })
  execFileSync("pnpm", ["install", "--force"], { cwd: root, stdio: "inherit" })
  execFileSync("pnpm", ["install", "--lockfile-only", "--ignore-scripts"], { cwd: root, stdio: "inherit" })
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: root, stdio: "inherit" })
} finally {
  await rm(temporary, { recursive: true, force: true })
}
