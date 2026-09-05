# Phase 1: shared Postgres board

Status: complete, verified 2026-09-05. No commits or publication performed in this
phase. Setup, migration instructions and HTTP examples are in
[`docs/DATABASE.md`](../DATABASE.md).

## Delivered

- Real Postgres 14+ persistence in relational `cards`, `card_dependencies` and
  `card_comments` tables, with foreign keys, explicit card ordering and a locked
  `board_revision` row. Parameterized mutations atomically validate and commit
  create/edit/move/reorder/archive/restore/delete/import/comment operations.
- Append-only, checksum-verified SQL migrations with transactional execution and
  an advisory lock. Removed, reordered or modified applied migrations are
  rejected. Connection pooling validates limits, bounds connection waits, handles
  idle connection errors and discards clients when rollback fails.
- Reusable HTTP endpoints for board read/actions/additive import, individual card
  read and attributed comments. GET supports ETag/304; stale mutations return 409.
  Request validation, body limits, same-origin checks and generic infrastructure
  errors protect the boundary. Production shared mode fails closed unless the
  operator explicitly selects local `AGORA_AUTH=none`, pending Phase 2 auth.
- An asynchronous shared-board controller and UI integration, selected at runtime
  by `DATABASE_URL`. Clients refresh every 1.5 seconds. The editor awaits saves,
  displays pending/errors and preserves drafts on network failure or revision
  conflict. It retains the revision at editor opening even if polling updates the
  board; an explicit retry uses the refreshed revision. A stable new-card ID
  prevents a retry from creating a second card if the first response was lost.
- Backward-compatible optional task metadata: type, assignee, effort/model/harness,
  PR URL, automerge/review gates, parent, dependencies and comments. References
  must exist; self references, duplicate dependencies and parent/dependency cycles
  are rejected. Incoming references prevent deletion. These fields are available
  through the API for the following roadmap phases.
- The existing shared component, design and Pages personal storage workflows
  remain intact. The toolbar distinguishes shared Postgres storage from storage
  private to the current browser.

## Verification evidence

The isolated database was `agora_roadmap` on the parent-provided local Postgres 14
instance. Each database/browser run created a random schema and removed that
schema afterward; no website database or environment was used.

| Check | Result |
| --- | --- |
| `pnpm test:db` with `TEST_DATABASE_URL` | 9 tests passed: migrations/checksums/history, SQL-shaped data, competing writers, card lifecycle/order, independent connections, relations/cycles, transaction rollback, HTTP ETags/validation/conflicts/comments/import and origin rejection |
| `pnpm test` | 18 tests passed; 9 database cases explicitly skipped without a test URL, run separately above |
| `pnpm lint` | Passed without warnings |
| `pnpm build` | Production build and TypeScript passed, including dynamic app/API routes |
| `pnpm design:check` | Shared stylesheet and archive integrity passed |
| Shared Playwright suite | 3 tests passed: two independent browser contexts with CRUD/live refresh/conflict-preserved drafts; network/pending-save recovery; keyboard drag/reorder/reload and mobile layout |
| Existing `pnpm test:e2e` | 25 passed, 5 existing device-specific skips across Pages desktop/mobile and local Next.js; includes pointer/touch drag, editor, backup, corrupt storage, multiple tabs and light theme |
| `git diff --check` | Passed |

Browser verification found and fixed a browser-only fetch receiver error and the
origin comparison needed when Next reconstructs a request URL using its bind
hostname. Browser tests are saved in `tests/shared-e2e`; database and async-store
regressions are saved in `tests/database.test.ts` and
`tests/remote-board-store.test.ts`.

## Handoff

`lib/server/database.ts` exposes `getPool()` and `withTransaction(fn, pool?)`.
`lib/server/board-repository.ts` exposes:

```ts
readBoard(pool?): Promise<{ board: BoardData; revision: number }>
mutateBoard(action, expectedRevision, pool?): Promise<BoardEnvelope>
transactBoard(expectedRevision, (board, client) => BoardData | Promise<BoardData>, pool?)
```

`transactBoard` supplies the same transaction client to future extensions, allowing
suggestion acceptance plus card creation to commit together. Throwing rolls back
both extension writes and the board update. Its coarse board lock prioritizes
correctness for a single shared board; later scaling can refine this without
changing the client revision contract.

Phase 2 should replace `authorizeRequest` in `lib/server/authorization.ts` with
the planned session/token/proxy policy and preserve its `{ name }` result for
comment attribution. Every current API endpoint already calls it. Preserve actual
Host/origin behavior for Next deployments and add an explicit trusted-proxy/public
origin policy with auth. Authentication currently applies to the API; private
server data is not embedded into page HTML.

The local `BoardStore` remains synchronous. `RemoteBoardStore` implements the
separate `BoardController` contract with asynchronous dispatch/replace. Do not
replace browser storage methods with asynchronous functions. Backup `version: 1`
is independent from server `revision`. Configurable vocabulary is Phase 3;
the current default columns remain Backlog/Todo/Doing/Review.
