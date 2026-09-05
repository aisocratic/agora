# Dependency planning

`agora board --json`, `GET /api/board` and `GET /api/plan` return the same
revisioned envelope with the public workflow and these top-level classifications:

| Field | Meaning |
| --- | --- |
| `waves` | Deterministic arrays of agent leaf tasks in prerequisite order; only the first wave is runnable now |
| `runnableNow` | IDs in the current first wave; dispatch uses exactly this set |
| `readyToMerge` | Agent-owned review-stage tasks with PR URLs and completed prerequisites; carries `mergeAllowed` from automerge policy |
| `blocked` | Invalid/unknown workflow values, missing references, cycles, non-ready stages or unresolved external prerequisites, with explicit reasons |
| `needsBreakdown` | Empty epic cards requiring executable children |
| `humanAssigned` | Human-owned leaf work retained for humans |
| `gated` | Tasks whose own or ancestor human-review gate remains set |
| `completed` | Archived or configured done-role card IDs |
| `containers` | Parent cards with children, excluded from executable work units |
| `edges` | Expanded `{ from: prerequisiteId, to: dependentId }` graph, including relations into completed targets |

Every classified item preserves the card's ID, title, description, metadata,
comments and policy, and adds `prerequisites`, `reasons`, `runnable` and
`mergeAllowed`. Reasons carry a stable descriptive `code`, readable `message` and
`relatedIds`. IDs, edges and waves sort lexically for reproducibility. Input board
order does not affect planning. A task occurs in one classification only.

The pure `planBoard(board, workflow)` in `lib/planner.ts` defines the graph used by
both HTTP output and `dispatchBlockReason`. The graph view should consume this
same function with the board and public workflow, including reasons and expanded
edges; it must not infer readiness from column labels or assignee names.

## Dependency semantics

Parents are containers even if their configured type is task. An unfinished
container prerequisite expands recursively to its leaf descendants. Children
inherit all ancestor dependencies and review gates. Archived/done prerequisites
satisfy their edges; a completed container itself can satisfy an incoming edge.
Children still open under a completed parent are blocked for operator review.
Missing nodes, parent cycles, dependency cycles and cycles created by expansion
remain visible. Cycle reasons identify each strongly connected component separately,
including cross-edge members. Completed targets retain direct and inherited graph
relations while remaining outside the blocking scheduling graph. The planner does
not drop an unresolved edge to manufacture a
runnable wave.

A ready configured leaf assigned to a declared agent can appear in future waves
only if every unfinished prerequisite is also schedulable in an earlier wave.
Human tasks, gates, backlog/doing/review work, unknown assignees and empty epics
therefore block dependent scheduling until resolved. Future waves describe the
order if prior tasks finish; they grant no permission to dispatch now. Re-read the
plan after each state change. Historical labels/identities remain visible with
recovery reasons; they are never guessed to be agents or ready columns.

Completed work is excluded first. Structural problems block before execution
classification; empty epics need breakdown. Gates take precedence over human
assignment, while preserving the card's assignee. Human ownership takes precedence
over merge classification. An agent task in review with a PR and no unfinished
prerequisite goes to merge review. Other non-ready stages remain blocked.

`needsHumanReview` blocks before work starts. `automerge` controls merge policy at
the end and does not bypass that gate. `mergeAllowed: true` does not establish
that repository tests, reviews, branch protection or user authorization permit a
merge. No planner code executes agents or merges PRs.

Both read APIs authenticate before database access. Their ETag combines board
revision and a hash of public workflow configuration. Changing a role, identity
kind or agent policy invalidates a prior ETag even without a board mutation.

## Portable Claude Code skill

Run `agora skill install` from the target project to write exactly
`.claude/skills/agora/SKILL.md`. It does not need a board connection or credentials.
The same command works through a copied `agora.mjs` and locally packed CLI.
It creates missing real directories, rejects symbolic/hard-linked targets and
symbolic-link directories, and leaves a differing existing skill untouched unless
`--force` is explicitly supplied. Reinstalling identical content is idempotent.
No user-wide Claude configuration is touched and no agent is launched.

The maintained source is `skills/agora/SKILL.md`; `node scripts/embed-skill.mjs`
embeds it into the dependency-free CLI. Tests prevent source/distribution drift
and exercise copy/pack installation in temporary directories. The skill teaches
current-wave selection, configured status IDs, optimistic revisions, comments,
PR handoff and human/merge policy without expanding the user's authorization.

The installation location and frontmatter follow the official
[Claude Code skill format](https://code.claude.com/docs/en/slash-commands).
