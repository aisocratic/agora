import { readFile, writeFile } from "node:fs/promises"
const source = await readFile(new URL("../skills/agora/SKILL.md", import.meta.url), "utf8")
const target = new URL("../cli/agora.mjs", import.meta.url)
const cli = await readFile(target, "utf8")
const embedded = `// BEGIN EMBEDDED AGORA SKILL\nexport const AGORA_SKILL = ${JSON.stringify(source)}\n// END EMBEDDED AGORA SKILL`
const pattern = /\/\/ BEGIN EMBEDDED AGORA SKILL[\s\S]*?\/\/ END EMBEDDED AGORA SKILL/
if (!pattern.test(cli)) throw new Error("The embedded skill markers are missing")
await writeFile(target, cli.replace(pattern, () => embedded))
