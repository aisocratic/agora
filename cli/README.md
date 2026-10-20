# Agora CLI

A single dependency-free HTTP client for Agora, requiring Node 20.9+.

Run `agora help`, then `agora login --url https://your-board.example.com` and enter
a named API token at the hidden prompt. Credentials are stored privately (0600).
`agora board --json`, `get`, `create`, `edit`, `move`, `comment`, `archive`,
`restore`, `delete`, `export` and `import` all use the shared HTTP API.

Run `agora` on its own to see the board at a glance: In Progress, Review and
Todo, highest priority first, each card with its short id, priority, assignee
and whether it is ready to start, waiting on a person or blocked. `agora status`
takes `--all` (adds Backlog), `--mine`, `--assignee NAME`, `--search TEXT`,
`--limit N` and `--json`; `agora ls COLUMN...` shows the columns you name
(`agora ls done --limit 10`).

This package is distributed through local `npm pack` artifacts until registry
ownership and release are configured. Copying `agora.mjs` elsewhere also works:
`node /path/to/agora.mjs help` needs no repository or installed dependencies.

Full instructions: https://github.com/aisocratic/agora/blob/main/docs/CLI.md
