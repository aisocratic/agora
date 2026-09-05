# Agora CLI

The CLI is one dependency-free Node.js file (`cli/agora.mjs`, Node 20.9+). It only
speaks HTTP and never imports server code, database drivers or repository files.
Copy it anywhere and run `node /path/to/agora.mjs help`, or pack the local CLI:

```sh
pnpm cli:pack
# Use the exact tarball printed by npm pack, for example:
npm exec --offline --yes --package=/tmp/aisocratic-agora-cli-0.1.0.tgz -- agora help
```

`cli/package.json` exposes the executable `agora`. The package is private to
prevent accidental publication. No npm registry package has been published or
claimed by this work; the project's future `npx agora` examples require a release.

## Connect

Create a named API token on the server, then configure the CLI:

```sh
node cli/agora.mjs login --url https://board.example.com
# Enter the token at the hidden prompt.
```

For a noninteractive login, supply the secret through stdin (`--token-stdin`) or
`AGORA_TOKEN`, rather than placing it in shell history or process arguments.
Login validates access with `/api/auth/session` before saving anything. Credentials
are written atomically with mode 0600 under `$XDG_CONFIG_HOME/agora/config.json`
(default `~/.config/agora/config.json`). `AGORA_CONFIG` selects another file.
Existing configuration files must be regular private files. URL overrides do not
reuse a saved token for a different origin. HTTPS is required except for loopback
HTTP testing; embedded URL credentials, paths, queries and fragments are rejected.
Redirects are refused so a server cannot redirect a bearer token elsewhere.

`AGORA_URL` and `AGORA_TOKEN` provide ephemeral configuration. `agora logout`
removes the saved CLI credentials; revoke the token on the server to invalidate
other copies. CLI logout is separate from browser session logout.

## Commands

```sh
agora whoami
agora board --json
agora get AG-41
agora create --title 'Implement the change' --column backlog
agora edit AG-41 --title 'Updated task'
agora move AG-41 review --position 0
agora comment AG-41 --author claude < notes.md
agora archive AG-41
agora restore AG-41
agora delete AG-41
agora dispatch AG-41 --revision 12 --idempotency-key 6bd683df-8144-42ee-92f3-992e29de8ce9
agora dispatch-status DISPATCH_ID
agora export --output backup.json
agora import backup.json
```

Use actual IDs from `create` or `board`; creation generates a UUID. `delete`
requires an archived card. `--author` is optional and, when supplied, must match
the authenticated token name. Comment attribution cannot be spoofed.

`create`/`edit` accept JSON drafts through `--stdin` or `--data JSON`, including
task metadata/dependencies supported by the API. Individual `--title`,
`--description`, and `--column` options override those fields. Import accepts a
backup file or JSON stdin and adds missing IDs while preserving existing cards.
Export writes backup schema version 1, not the server envelope.

```sh
printf '%s' '{"title":"Investigate","description":"Context","column":"todo","type":"task","assignee":"claude","effort":"high","dependencies":[]}' | agora create --stdin
agora edit AG-41 --title 'Reviewed title' --revision 12
```

Mutations read the latest revision unless `--revision N` is supplied. An edit
reads its existing fields and revision together before applying the supplied
patch. HTTP 409 is surfaced without blind retry. For a change based on an earlier
read, pass the revision from that read, review any conflict, and retry explicitly.
For long-running agent work this protects decisions based on stale state.

`board --json` preserves the complete server response: `board`, `revision`, public
`workflow`, planning classifications and `runnableNow`. Only the current first
wave is runnable; [PLANNING.md](PLANNING.md) defines dependency and gate semantics.
Other data commands emit JSON; plain `board` lists card IDs, columns and titles.
Server error bodies and secrets are never echoed into CLI errors.

Exit codes: `0` success, `1` local filesystem/unexpected failure, `2` input or
rejected request, `3` authentication, `4` revision conflict, `5` network/server.
Requests time out after 15 seconds.

Dispatch requires an explicit UUID idempotency key. Reuse the original key and
revision to inspect the same reservation after a timeout; never blindly launch a
replacement. `pending` and `uncertain` receipts are JSON outcomes, not completed
work. See [DISPATCH.md](DISPATCH.md) for receiver checks and adapter setup.

## Propose work for human review

```sh
agora suggest --title 'Investigate flaky retries' --reason 'Observed repeated failures'
agora suggest --stdin < proposal-draft.json
agora suggestions list --state pending --limit 50 --offset 0
agora suggestions get SUGGESTION_UUID
```

`--stdin`/`--data` accept the proposed card draft, including task metadata,
parent and dependencies; title/description/column flags override draft fields.
Omitting the destination selects the configured backlog. The server derives
proposal attribution from authentication. Submission does not mutate the board
and does not take a board revision. Tokens may read and submit; a person reviews,
edits, accepts or dismisses proposals in the shared browser inbox. See
[SUGGESTIONS.md](SUGGESTIONS.md) for version and retry semantics.

## Install the Claude Code skill

From the project where the skill should be available:

```sh
agora skill install
# Review an existing customized skill before explicitly replacing it:
agora skill install --force
```

The command writes `.claude/skills/agora/SKILL.md` under the current project. It
works without credentials, from a copied executable or local tarball. Identical
content is left unchanged; differing content requires `--force`. Symbolic-link
directories/targets and hard-linked files are rejected. Installation neither
changes user-wide settings nor launches an agent. The embedded skill is maintained
in `skills/agora/SKILL.md`; see [PLANNING.md](PLANNING.md) for behavior and maintenance.
