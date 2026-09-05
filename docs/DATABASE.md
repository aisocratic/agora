# Shared Postgres board

The Next.js app selects shared mode when `DATABASE_URL` is set. Without it, the
app and GitHub Pages use the personal browser board. The board toolbar identifies
the selected storage mode. Pages never receives database credentials.

## Local setup

Use Postgres 14 or newer. The optional `docker compose up -d db` starts the
development database configured in this repository. For that database:

```sh
pnpm install --frozen-lockfile
export DATABASE_URL=postgres://agora:agora@localhost:5432/agora
export AGORA_AUTH=none # explicit loopback development only
pnpm db:migrate
pnpm dev
```

Export the connection variable in the shell for migration commands; the migration
script does not implicitly load Next.js environment files. Point `DATABASE_URL` at
your own server instead when using an existing database. `DATABASE_SSL=require`
enables TLS with certificate verification. `DATABASE_POOL_MAX` is an integer from
1 to 100, default 10.

For production builds, configure password or trusted-proxy access and the exact
public origin as described in [AUTH.md](AUTH.md), then run `pnpm build` and
`pnpm start`. Production always rejects `AGORA_AUTH=none`.

## Migrations and data

`db/migrations` contains ordered SQL migrations. Applied filenames and SHA-256
checksums are recorded in `schema_migrations`. Migration runs use one transaction
and an advisory lock. Never edit, remove or insert ahead of applied migrations;
append a new numbered file. Run migrations before starting a new application
version. Back up the database before an upgrade using your normal Postgres tools.

Cards are rows in `cards`, with explicit ordering, timestamps and optional parent
foreign keys. `card_dependencies` and `card_comments` are relational tables.
Optional task policy fields live in each card's metadata JSONB. Every shared
mutation locks `board_revision`, checks the submitted revision, validates the
result and commits data plus the next revision together. Stale writers receive
HTTP 409 and cannot silently replace another client's changes. The initial
implementation serializes whole-board mutations; it targets a single shared
board, rather than high-volume multitenant operation.

Clients poll every 1.5 seconds with ETags. An open card editor retains the revision
at which editing began. If another client changes the board, a save conflict keeps
the draft open and loads the current board; saving again explicitly retries the
draft against that revision. Network failures also keep the editor open. Mutations
display pending state and never report success before the server confirms them.

## HTTP contract

All routes pass through `authorizeRequest` in `lib/server/authorization.ts`, which
is the integration point for authentication and API tokens.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/board` | Optional `If-None-Match` using the returned ETag | `{ board, revision, workflow, ...plan }` plus `ETag`, or 304 |
| `POST /api/board` | `{ action, revision }` | Updated `{ board, revision }` |
| `PUT /api/board` | `{ board, revision }` | Add missing card IDs, preserve existing IDs; updated state |
| `GET /api/cards/:id` | — | `{ card, revision }`, or 404 |
| `POST /api/cards/:id/comments` | `{ body, revision }` | Updated board with a server-attributed comment, status 201 |

The read envelope includes the [planning classifications](PLANNING.md). Its ETag
combines board revision and workflow configuration, so configuration-only changes
also invalidate cached plans. Return the exact received ETag in `If-None-Match`.

Mutation requests use `Content-Type: application/json`. `board` has schema
`{ version: 1, cards: [...] }`; its `version` is the backup format version, distinct
from the monotonically increasing server `revision`. Supported actions are:

```json
{"type":"create","id":"task-1","draft":{"title":"Ship it","description":"Context","column":"backlog"}}
{"type":"edit","id":"task-1","draft":{"title":"Updated title","description":"Context","column":"todo"}}
{"type":"move","id":"task-1","column":"doing","position":0}
{"type":"archive","id":"task-1"}
{"type":"restore","id":"task-1"}
{"type":"delete","id":"task-1"}
```

Delete requires an archived card without incoming parent/dependency references.
Titles are required and limited to 200 characters; details/comments to 10,000.
Invalid inputs return 400, cross-origin browser mutations 403, stale revisions
409, oversized bodies 413, and unavailable database/auth configuration 503.

Drafts may also carry `type`, `assignee`, `effort`, `model`, `harness`, `prUrl`,
`automerge`, `needsHumanReview`, `parentId` and `dependencies`. Nullable assignment,
runtime settings, PR URL and parent can be cleared with `null`; dependencies can
be cleared with `[]`. Omitted optional edit fields preserve existing values.
Parent/dependency IDs must exist, cannot refer to the card itself, and each graph
must be acyclic. Comments are `{ id, body, author, createdAt }`; clients add them
through the dedicated comments endpoint.

Example against a freshly migrated local board:

```sh
curl http://localhost:3000/api/board
curl -X POST http://localhost:3000/api/board \
  -H 'Content-Type: application/json' \
  --data '{"revision":0,"action":{"type":"create","id":"task-1","draft":{"title":"Ship it","description":"Context","column":"backlog"}}}'
```

Read the current revision before later mutations. Never automatically retry a
stale edit against a newer revision without reviewing the concurrent change.

## Verification

Use a dedicated test database; both commands create unique schemas and remove only
their own schema afterward:

```sh
export TEST_DATABASE_URL=postgres://agora:agora@localhost:5432/agora_test
pnpm test:db
pnpm test:e2e:shared
```

The database role needs permission to create schemas. `pnpm test:db` requires a
connection and never treats a missing database as a passing integration run.
Ordinary `pnpm test` skips the database suite when no test URL is provided.
Run `pnpm test:e2e` separately for existing Pages desktop/mobile and local Next.js
workflows. Do not run both browser commands simultaneously: they share production
build output and browser test artifacts.
