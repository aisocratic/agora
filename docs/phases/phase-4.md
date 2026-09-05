# Phase 4 acceptance — planning and Claude Code skill

Completed 2026-09-05. The phase used isolated temporary schemas in the supplied
Postgres 14 roadmap database, temporary CLI installation directories, and the
production test server on 4290. It did not touch website data, user Claude settings
or launch any agent. No commits, pushes or publication were performed.

## Delivered

`lib/planner.ts` implements the pure deterministic planning contract and exports
BoardPlan/PlanItem/PlanReason. It expands parent prerequisites to leaves, inherits
ancestor dependencies and review gates, recognizes archived/configured completion,
and preserves explicit human/unknown ownership. Empty epics need breakdown;
missing nodes, cycles and combined parent/dependency cycles produce visible
reasons. Non-schedulable prerequisites block dependent work instead of being
silently dropped. Only the first future wave is runnable now.

`lib/dispatch-policy.ts` now delegates to that same engine. Review-stage agent
cards with PRs and completed prerequisites are classified for merge review;
automerge policy remains independent of the pre-work human gate and does not
claim repository checks/reviews or user merge authorization are satisfied.

Authenticated GET `/api/board` and `/api/plan` share one response implementation.
The complete envelope includes board, revision, public workflow, readyToMerge,
waves, blocked, needsBreakdown, humanAssigned, gated, completed, containers,
runnableNow and expanded graph edges. Workflow-only policy changes invalidate the
ETag without requiring a board mutation. `agora board --json` preserves all fields.

`agora skill install` works from the copied/packed dependency-free CLI without
server credentials. It installs the embedded maintained skill at the current
project's `.claude/skills/agora/SKILL.md`, is idempotent, requires explicit force for
changed content, and rejects symlink directories/targets and hard-linked files.
The skill covers actual task selection, revision conflicts, comments, status,
dispatch receipts, PR/review/merge policy and suggestions while retaining user
scope and authorization. `scripts/embed-skill.mjs` maintains the portable payload.

## Verification evidence

| Check | Result |
| --- | --- |
| `TEST_DATABASE_URL=… pnpm verify` | 72 tests passed across 15 files; design, TypeScript and ESLint passed |
| Planner fixtures | Seven tests cover branches/chains/diamonds, deterministic order, leaf/epic expansion, human/unknown blockers, inherited gates, completion, merge policy, missing references, direct and combined cycles, unknown vocabulary and disabled agents |
| Real Postgres planner/API | Two tests exercise relational plans, authenticated endpoints, identical API envelopes, future-wave dispatch rejection and config-only ETag invalidation |
| Shared dispatch regression | Five real database tests pass with the centralized planner, including actual loopback receiver and harmless local process |
| Portable installer | Three tests cover idempotency/force, unchanged outside files under symbolic/hard links, copied binary and local tarball installation outside clone without credentials |
| Production build and shared browser/CLI | Seven scenarios passed, including new copied-CLI planning, future-wave denial and refreshed readiness after prerequisite archive |
| Skill creator validator | `quick_validate.py skills/agora` passed using temporary Python environment with PyYAML |
| `git diff --check` | Passed |

Phase 5's latest Pages/personal-app suite had 28 passes and five intentional device
skips; Phase 4 changes server planning and portable CLI only, and preserves those
UI files. Its new production shared suite also rechecks auth, two-client refresh,
conflict-safe drafts, editor/comments, keyboard drag and copied/packed CLI flows.

The skill follows the official
[Claude Code filesystem skill format](https://code.claude.com/docs/en/slash-commands).
No external action was used to test skill behavior. Installation and protection
checks ran only in temporary directories.

## Phase 6 handoff

Use `planBoard(board, workflow)` from `lib/planner.ts` for graph readiness. Edges
are `{ from: prerequisiteId, to: dependentId }` and retain completed prerequisites;
container dependencies expand to leaves. `runnableNow` is the dispatch eligibility
set. Plan items extend BoardCard with `reasons: { code, message, relatedIds }[]`,
`prerequisites: string[]`, `runnable` and `mergeAllowed`. Refer to PLANNING.md for
classification priority and completion semantics. The graph should show supplied
reasons and use public column roles/person kinds rather than infer labels.

The suggestions worker's CLI commands, toolbar mount and migration 004 remain
intact. Root retains CI, roadmap and public-copy ownership; the build slot and
stable planner contract were handed back after verification.

## Integration review follow-up

Root review identified two graph edge cases after initial acceptance. Cycle
classification now uses Tarjan strongly connected components, including members
reached through cross edges; each reason lists only its own component, so unrelated
cycles remain distinct. Expanded graph edges now include direct and inherited
prerequisites into completed targets. Completed nodes remain outside the blocking
scheduling graph and continue to satisfy their dependents. The Phase 6 graph
worker received the updated edge contract.

Focused verification passed 16 tests: nine pure planner fixtures, two real
Postgres planner/API tests and five real Postgres dispatch regression tests. New
fixtures cover A-B-C-A plus A-D-C cross-edge membership, two disjoint cycles,
downstream blockers, completed targets with inherited/direct edges, and a stored
cycle broken for scheduling by completion. Focused ESLint passed. No production
build was run during this follow-up because Phase 6 owns the build slot.
