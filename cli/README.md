# Agora CLI

A single dependency-free HTTP client for Agora, requiring Node 20.9+.

Run `agora help`, then `agora login --url https://your-board.example.com` and enter
a named API token at the hidden prompt. Credentials are stored privately (0600).
`agora board --json`, `get`, `create`, `edit`, `move`, `comment`, `archive`,
`restore`, `delete`, `export` and `import` all use the shared HTTP API.

Run `agora` on its own to see the board as the web shows it: In Progress,
Review and Todo side by side, each card a box with its breadcrumb (the epics
above it), its title, and a footer with its short id, priority, assignee, PR
and whether it is ready to start, waiting on a person or blocked. Columns stack
when the terminal is under about 90 columns wide, and each column shows the
cards that fit the terminal's height, then "+ N more". `agora status` takes
`--all` (adds Backlog), `--mine`, `--assignee NAME`, `--search TEXT`,
`--limit N` (cards per column), `--list` (one line per card instead),
`--color` (color even when stdout is not a terminal, as under `watch -c`;
`FORCE_COLOR=1` does the same, `NO_COLOR` turns it off) and `--json`.
`agora ls COLUMN...` lists the columns you name (`agora ls done --limit 10`).

This package is distributed through local `npm pack` artifacts until registry
ownership and release are configured. Copying `agora.mjs` elsewhere also works:
`node /path/to/agora.mjs help` needs no repository or installed dependencies.

Full instructions: https://github.com/aisocratic/agora/blob/main/docs/CLI.md
