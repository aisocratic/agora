# Suggestions inbox

Agents can propose work without creating a board card. In shared mode, **Suggestions** shows the pending count and opens an inbox. A person can inspect the original proposal, edit the proposed title, details, destination and task metadata, save a review draft, accept it into the board, or dismiss it with a note. Accepted cards open in the existing card editor. Local GitHub Pages boards do not expose this server inbox.

The server records the authenticated principal as the author; requests cannot supply an author. API tokens may submit and read proposals. Acceptance, dismissal and saved review drafts require a human browser principal (password session, trusted proxy, or permitted local development identity). Browser mutations retain the application's Origin/CSRF checks. Acceptance creates a card; it does not dispatch an agent.

## HTTP contract

All routes require authentication and return private, non-cacheable JSON. Proposal and review drafts use the same configured task vocabulary and relationship validation as board cards, including parent cards, dependencies, model, harness, effort, assignee, type and PR URL. An omitted destination defaults to the configured backlog column, or the first configured column.

| Request | Body / query | Result |
| --- | --- | --- |
| `POST /api/suggestions` | `{draft, reason?}` | `201 {suggestion}` |
| `GET /api/suggestions` | `state=pending\|accepted\|dismissed\|all`, `limit=1..100`, `offset=0..100000` | `{suggestions, counts, limit, offset}` |
| `GET /api/suggestions/:id` | — | `{suggestion}` |
| `PATCH /api/suggestions/:id` | `{version, draft}` | Saved review draft; version increments |
| `POST /api/suggestions/:id/accept` | `{version, revision, draft}` | `{suggestion, board, revision, replayed}` |
| `POST /api/suggestions/:id/dismiss` | `{version, note?}` | `{suggestion}` |

Read the current board revision from `GET /api/board` before acceptance. The suggestion version and board revision are checked in one PostgreSQL transaction; card persistence and the terminal suggestion state commit together. Acceptance revalidates current workflow and relationships. Failed validation, stale revisions and database failures leave the proposal pending and create no card. A `409` requires reviewing current state before retrying.

The suggestion UUID is its future card ID. Repeating an accepted request with the original suggestion version and identical normalized draft returns the existing result with `replayed: true`, even after the board advances. It cannot create a second card. Different draft intent conflicts. A repeated dismissal with its original version returns the existing dismissal without rewriting the decision. Competing accept/dismiss requests produce one terminal outcome.

The original proposal, authenticated author, latest saved review draft, reviewer, decision time and dismissal note remain available in reviewed history. History retains the accepted card ID even if that card is later deleted. This is a proposal/decision record, not an audit log of every intermediate keystroke or draft revision.

Titles are limited to 200 characters, details to 10,000, proposal reasons to 4,000 and dismissal notes to 2,000. At most 1,000 pending proposals are accepted. List results default to 50 per page. The UI refreshes counts every five seconds while visible; refresh does not replace an open review draft. Conflicts and network errors preserve the local draft, with an explicit refresh action for loading the latest versions.

## CLI

```sh
agora suggest --title 'Add missing coverage' --description 'Exercise the failure path' --reason 'The retry branch has no test'
agora suggest --stdin < proposal-draft.json
agora suggestions list --state pending --limit 50
agora suggestions get SUGGESTION_UUID
```

The JSON stdin is the draft itself, including supported metadata and relationships. The CLI uses the same HTTP API and authenticated attribution. Review decisions are intentionally browser-only. See [CLI.md](CLI.md) for credential configuration.

## Storage and verification

Run `pnpm db:migrate` to apply append-only migration `004_suggestions.sql`. It adds the indexed suggestions table without rewriting earlier migrations. No external suggestion service or agent process is required.

```sh
TEST_DATABASE_URL=postgres://…/isolated_test_db pnpm exec vitest run tests/suggestions.test.ts tests/suggestions-database.test.ts
pnpm build
TEST_DATABASE_URL=postgres://…/isolated_test_db pnpm exec playwright test --config playwright.suggestions.config.ts
```

Database tests use unique schemas and remove them afterward. Browser tests require a loopback PostgreSQL test database, start the production app on port 4291, and use fixture credentials; they do not read or change a user's CLI configuration.
