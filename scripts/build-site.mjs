import { build } from "esbuild"
import { readFile, writeFile } from "node:fs/promises"
import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
await build({
  absWorkingDir: root,
  entryPoints: { board: "site/board-entry.tsx", dashboard: "site/dashboard-entry.tsx" },
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  outdir: "site/assets",
  define: { "process.env.NODE_ENV": '"production"' },
  metafile: false,
  sourcemap: false,
})
console.log("Built the shared Agora board for GitHub Pages")

const themeSource = resolve(root, "site/dashboard.css")
const theme = await postcss([tailwindcss({ base: root })]).process(await readFile(themeSource, "utf8"), { from: themeSource, to: resolve(root, "site/assets/dashboard-theme.css") })
await writeFile(resolve(root, "site/assets/dashboard-theme.css"), theme.css)
