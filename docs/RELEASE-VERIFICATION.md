# Agora roadmap release verification

Verified 2026-09-05. All seven phases are complete and merged through
[PR #1](https://github.com/aisocratic/agora/pull/1), merge commit `be45606`.

## Integration acceptance

| Requirement | Evidence |
| --- | --- |
| Scaffold, shared Stoa design, build | Frozen-lockfile clean CI install; design integrity, TypeScript, ESLint and production builds passed. |
| PostgreSQL board and HTTP mutations | Database suite verifies migration checksums/idempotency, parameterized data, transactions, concurrent revisions, lifecycle persistence, comments and HTTP contracts. |
| Multi-client refresh and conflict safety | Shared production browsers verify independent clients, live refresh, persisted ordering and conflict/network failures retaining drafts. |
| Authentication, tokens, CLI | Auth tests cover production refusal of open access, sessions/CSRF/revocation/proxy/token scope; copied/packed CLI browser workflows verify the real HTTP API. |
| Configuration and dispatch | Real database/receiver/process tests verify vocabulary, signed webhook bytes, idempotent dispatch and gates; adapter tests cover configured workflow dispatch and timeouts. |
| Planning and portable skill | Planner/database/CLI tests verify waves, epics, human assignments, review/merge gates, cycles, inherited dependencies and portable skill installation. |
| Human-reviewed suggestions | PostgreSQL tests verify atomic/idempotent decisions and token restrictions; desktop/mobile browsers verify review, acceptance, dismissal, conflict recovery and copied CLI proposals. |
| Dependency graph | Pages/local/shared desktop/mobile acceptance verifies direction, keyboard/navigation/editing, cycle rejection, empty states and mobile overflow. Unit tests verify all nodes fit for a 1,000-card mobile graph. |
| Setup and public documentation | README, contributor setup, API/auth documentation and public phase statuses match implemented commands and behavior. |
| Published personal board | Pages deployment succeeded; live browser inspection confirmed the graph control/empty state and all seven Done indicators. |

## Full CI results

[Pre-merge CI](https://github.com/aisocratic/agora/actions/runs/33961422128)
and [merged-main CI](https://github.com/aisocratic/agora/actions/runs/33961584819)
passed all checks:

- 80 unit/database tests across 16 files, with real PostgreSQL 14.
- 31 Pages/local-app browser cases; five intentional device-specific skips.
- Nine shared application browser cases.
- Seven suggestions browser cases; the duplicate mobile CLI case is intentionally skipped.

[Pages deployment](https://github.com/aisocratic/agora/actions/runs/33961584855)
published the verified source. The live visual audit then corrected selected-view
hover contrast in dark mode and rechecked the rebuilt graph in Chrome. The public
review-gate field name and human-only suggestion review copy were also corrected.
Pages now watches every shared component/library change so graph updates publish.
The release versions the board asset URLs to refresh returning browsers
that otherwise retain the previous JavaScript/CSS in their HTTP cache.
Subsequent CI/deployment records are available in the repository Actions history.

This release provides source for the shared self-hosted application and publishes
the personal Pages board. It does not provision a production PostgreSQL server or
publish an npm registry package.
