import { build } from "esbuild"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
await build({
  absWorkingDir: root,
  entryPoints: ["site/board-entry.tsx"],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  outfile: "site/assets/board.js",
  define: { "process.env.NODE_ENV": '"production"' },
  metafile: false,
  sourcemap: false,
})
console.log("Built the shared Agora board for GitHub Pages")
