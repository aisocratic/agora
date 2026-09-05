# Agora CLI

A single dependency-free HTTP client for Agora, requiring Node 20.9+.

Run `agora help`, then `agora login --url https://your-board.example.com` and enter
a named API token at the hidden prompt. Credentials are stored privately (0600).
`agora board --json`, `get`, `create`, `edit`, `move`, `comment`, `archive`,
`restore`, `delete`, `export` and `import` all use the shared HTTP API.

This package is distributed through local `npm pack` artifacts until registry
ownership and release are configured. Copying `agora.mjs` elsewhere also works:
`node /path/to/agora.mjs help` needs no repository or installed dependencies.

Full instructions: https://github.com/aisocratic/agora/blob/main/docs/CLI.md
