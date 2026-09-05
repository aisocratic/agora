# Phase 3 acceptance — configuration and dispatch

Completed 2026-09-05 against the isolated Postgres 14 roadmap database. Tests use
unique schemas and remove them afterward; no website database or environment was
used. No commit, push, publication, external workflow dispatch or real coding-agent
launch was performed.

## Delivered

- Validated `agora.config.ts` and optional trusted JSON configuration; separate
  public workflow and private dispatcher settings. Explicit column roles,
  task/epic kinds, human/agent identities and effort/model/harness lists.
- Configured server mutation validation without schema changes for vocabulary;
  existing unconfigured values remain visible and editable. Configuration changes
  participate in the board ETag. Pages remains a public personal board.
- Rich editor for metadata, PR/automerge/review gates, parent/dependencies and
  authenticated shared comments; local comments and backups retain those fields.
- Authenticated dispatch and receipt endpoints, CLI commands and editor action.
  Transactional migration 003 reservations prevent repeated card/revision
  dispatch; retries retrieve the original receipt. Pending and uncertain outcomes
  remain explicit and never trigger automatic replay.
- None, exact-body HMAC webhook, explicit opt-in execFile command and configured
  GitHub workflow adapters, with time/response/output bounds. Human, epic,
  review-gated and blocked tasks cannot dispatch. None remains the default.
- Operator documentation in CONFIGURATION.md, DISPATCH.md and examples/dispatch;
  API/CLI/security/environment guides updated.

## Verification evidence

| Check | Result |
| --- | --- |
| `TEST_DATABASE_URL=… pnpm verify` | 51 tests passed in 10 files; design, TypeScript and ESLint passed |
| Real Postgres integration subset | 18 passed: 9 board, 4 auth, 5 configuration/dispatch tests |
| Production Next build | Passed, including both new authenticated dispatch routes |
| Shared production browser suite, server 4290 | All six scenarios passed; new CLI option allowlist issue fixed and affected copied/packed CLI scenario rerun successfully |
| `pnpm test:e2e` | 28 passed, five intentional device-specific skips; production app and static Pages builds included |
| Browser additions | Rich metadata/dependencies/gates/comments survive shared reload; historical vocabulary/local comments recover on Pages desktop/mobile and personal Next app |
| Dispatch integrations | Real loopback HTTP receiver verifies raw signature and concurrent deduplication; real harmless Node process receives JSON without DB secrets; uncertain outcomes do not replay |
| Adapter/receiver checks | Configured GitHub URL/ref/input contract, strict configuration, 64 KiB response cap, real process deadline, signature tampering and stale timestamps |
| CLI distribution | Copied executable and locally packed `npm exec --offline` outside clone complete authenticated workflows, dispatch receipt/status/retry included |
| Public bundle inspection | No DATABASE_URL, AGORA_PROXY_SECRET, AGORA_WEBHOOK_SECRET or AGORA_CONFIG_FILE identifiers in Next client chunks or Pages board bundle |
| `git diff --check` | Passed |

The installed `codex exec --help` and `claude --help` verified example flags.
Primary references: [Codex noninteractive execution](https://developers.openai.com/codex/noninteractive/)
and [GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
The GitHub adapter was tested through a bounded fetch stub; no external repository
was dispatched. Direct command timeouts cannot guarantee descendant work stopped;
this limitation and durable-queue recovery are documented.

## Handoff

`lib/workflow.ts` exports Workflow/workflowSchema; `getPublicWorkflow` and
`getConfiguration` live in lib/server/configuration.ts. Public configuration has
no dispatch secrets. `validateConfiguredAction(board, action, workflow)` validates
new vocabulary while preserving historical data.

`transactBoard(expectedRevision, updater(board, PoolClient), pool?)` takes the
board revision lock, parses/validates the result, persists relational state and
increments the revision. Suggestions can atomically accept their rows inside that
same transaction. `authorizeRequest(request, true)` supplies `{ name, kind }`.

Phase 4 should centralize `dispatchBlockReason` with the planner contract, expand
parent/epic dependencies and provide graph/plan classifications without changing
safe dispatch reservations. Phase 5 owns migration 004 and suggestion surfaces;
its agent received the stable contracts and the board/CLI/build ownership handoff.
