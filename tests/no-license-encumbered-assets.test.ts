import { execFileSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(import.meta.dirname, "..")

/**
 * Agora is MIT. The codebase it was extracted from shipped Sentient, a licensed
 * Fontshare face, as woff2 files under public/fonts and referenced it through a
 * `--font-sentient` token. Neither may come back: a font binary in the tree
 * would be redistribution we have no right to do, and the port is exactly the
 * kind of change that reintroduces one by accident.
 *
 * Every face Agora uses is OFL and loaded through next/font/google, which
 * self-hosts at build time — so the correct number of font files in this repo is
 * zero, forever.
 */
describe("license-encumbered assets", () => {
  it("ships no font binaries", () => {
    const fontDir = join(ROOT, "public", "fonts")
    const files = existsSync(fontDir) ? readdirSync(fontDir) : []
    expect(files).toEqual([])
  })

  it("does not reference the Sentient font anywhere in source", () => {
    // git grep so node_modules and build output are excluded for free, and only
    // tracked files are considered.
    let hits = ""
    try {
      hits = execFileSync(
        "git",
        ["grep", "-il", "sentient", "--", ".", `:!tests/${"no-license-encumbered-assets.test.ts"}`],
        { cwd: ROOT, encoding: "utf8" },
      )
    } catch (error) {
      // git grep exits 1 with no output when nothing matches, which is the
      // passing case. Anything else is a real failure worth surfacing.
      const { status, stderr } = error as { status?: number; stderr?: string }
      if (status !== 1) throw new Error(stderr || String(error))
    }
    expect(hits.trim()).toBe("")
  })
})
