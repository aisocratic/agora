#!/usr/bin/env node
/*
 * Refresh site/vendor/stoa.css from the published package.
 *
 *   node site/scripts/sync-stoa.mjs
 *
 * The landing site has no build step and must keep working from file://, so the
 * design tokens are vendored rather than imported. Bump VERSION, run this, commit.
 *
 * Needs @aisocratic/stoa on npm; until it is published, copy
 * `stoa/dist/css/tokens.css` by hand and keep the first-line comment.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const VERSION = "0.2.0"

const URL_ = `https://cdn.jsdelivr.net/npm/@aisocratic/stoa@${VERSION}/dist/css/tokens.css`
const OUT = join(dirname(dirname(fileURLToPath(import.meta.url))), "vendor", "stoa.css")

const res = await fetch(URL_)
if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${URL_}`)
const css = await res.text()
if (!css.includes("--brand-gradient")) throw new Error(`unexpected payload from ${URL_}`)

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, `/* @aisocratic/stoa ${VERSION} — vendored; refresh with scripts/sync-stoa.mjs */\n${css}`)
console.log(`wrote ${OUT} (${css.length} bytes from @aisocratic/stoa@${VERSION})`)
