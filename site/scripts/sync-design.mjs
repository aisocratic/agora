#!/usr/bin/env node
// Run from any working directory: node site/scripts/sync-design.mjs /path/to/stoa
// --check validates the vendored stylesheet against its recorded SHA-256.
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const target = resolve(root, "site/vendor/design.css")
const metadataPath = resolve(root, "site/vendor/design.json")
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const source = process.argv[2]
if (source === "--check") {
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"))
  const actual = hash(await readFile(target))
  if (actual !== metadata.sha256) throw new Error("Vendored design.css differs from its recorded SHA-256. Run pnpm design:sync /path/to/stoa.")
  const archiveMetadata = JSON.parse(await readFile(resolve(root, "vendor/design.json"), "utf8"))
  const archiveHash = hash(await readFile(resolve(root, "vendor", archiveMetadata.archive)))
  if (archiveHash !== archiveMetadata.sha256) throw new Error("Design package archive differs from its recorded SHA-256")
  if (archiveMetadata.version !== metadata.version) throw new Error("The app and static site must use the same design version")
  console.log(`Verified ${metadata.package}@${metadata.version}: CSS ${actual}; archive ${archiveHash}`)
} else {
  if (!source) throw new Error("Usage: node site/scripts/sync-design.mjs /path/to/stoa | --check")
  const sourceRoot = resolve(source)
  const pkg = JSON.parse(await readFile(resolve(sourceRoot, "package.json"), "utf8"))
  if (pkg.name !== "@aisocratic/design") throw new Error("Expected a built @aisocratic/design checkout")
  const css = await readFile(resolve(sourceRoot, "dist/css/site.css"))
  if (!css.includes(".project-hero") || !css.includes("--brand-gradient")) throw new Error("Build Stoa first: expected tokens and shared site recipes")
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, css)
  await writeFile(metadataPath, JSON.stringify({ package: pkg.name, version: pkg.version, source: "dist/css/site.css", sha256: hash(css) }, null, 2) + "\n")
  console.log(`Synced ${pkg.name}@${pkg.version} site.css (${css.length} bytes)`)
}
