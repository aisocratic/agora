# Planner acceptance contract

Derived from the public agent-loop and board JSON examples in `site/index.html`. Phase 4 must expose the actual plan through an HTTP endpoint and the dependency-free CLI; a hard-coded example is insufficient.

- Only executable leaf tasks are work units. Epics/parents are containers; an empty epic is reported under `needsBreakdown`.
- Dependencies determine deterministic topological waves. A dependent cannot start while its prerequisites remain incomplete, including prerequisites assigned to a human.
- Human assignments are preserved. The planner must never silently reassign or schedule a human-owned task for an agent. Unknown assignee identities should not be presumed to be agents.
- `needsHumanReview` is a gate before work starts. `automerge` governs permission to merge at the end, not permission to perform development work. Merely having a PR URL grants neither review nor merge permission.
- Review-stage cards with a PR are classified for merge review rather than dispatched as new work; the output carries the automerge policy, and the skill requires that policy before any automatic merge.
- Completed/archived work can satisfy dependencies; archived cards themselves are not dispatched. Configured workflow vocabulary must define completion/ready/review semantics without a database migration.
- Cycles and missing dependencies yield visible reasons; do not produce apparently runnable waves by dropping edges. Include hierarchy/dependency interactions when expanding parent dependencies to leaf work.
- The JSON shape covers `readyToMerge`, `waves`, `blocked`, `needsBreakdown`, `humanAssigned`, and `gated`. Items retain enough ID/title/context/policy metadata for a CLI agent to act safely.
- Tests must cover independent branches, chains, diamonds, parent/epic expansion, human-owned blockers, gates, review/merge policy, missing nodes and cycles, and deterministic ordering.

Phase 6 graph rendering consumes the same dependency semantics, so visual readiness and the CLI plan cannot disagree. The installed skill should document the real API/CLI, picking work, updating comments/status, opening a PR, and respecting human ownership and review/merge gates.
