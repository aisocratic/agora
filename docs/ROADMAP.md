# Agora roadmap completion contract

**All seven phases completed on 2026-09-05.** See [release verification](RELEASE-VERIFICATION.md) for integration and publication evidence.

Source: numbered roadmap and product examples in `site/index.html`, repository configuration and security policy. The personal Pages board is already working; the roadmap also requires the shared server and agent workflows below.

Each phase has a separate agent goal and an evidence report in `docs/phases/`. A phase is complete only when its delivered behavior is verified. The parent agent manages dependencies, integration, release checks, and publication.

| Phase | Dependencies | Required result | State |
|---|---|---|---|
| 0 | None | Runnable scaffold; shared Stoa design, fonts and tokens; clean build | Complete — `docs/phases/phase-0.md` |
| 1 | 0 | Real PostgreSQL board, append-only migrations, parameterized queries, card editor/columns/reorder and live refresh; HTTP operations and database integration tests | Complete — `docs/phases/phase-1.md` |
| 2 | 1 | Auth modes (local none, shared password, trusted proxy), secure sessions and API tokens; dependency-free HTTP CLI for login/board/get/comment/move and API operations | Complete — `docs/phases/phase-2.md` |
| 3 | 1, 2 integration | Configurable columns/types/people/agent vocabulary without migrations; none/webhook/opt-in command/GitHub workflow dispatch; signed raw webhook bodies and example adapters | Complete — `docs/phases/phase-3.md` |
| 4 | 1, 3 | Dependency-aware plan engine and Claude Code skill installer; leaf tasks, epics, deterministic waves, human assignments, review gates and ready-to-merge classification | Complete — `docs/phases/phase-4.md` |
| 5 | 1, 2 | Persisted suggestions inbox: agents submit proposals; humans review, edit, accept into cards or dismiss with atomic/idempotent transitions | Complete — `docs/phases/phase-5.md` |
| 6 | 1, 4 | Interactive dependency graph with card navigation/editing, accurate dependency direction, cycle feedback and useful empty/mobile states | Complete — `docs/phases/phase-6.md` |

## Integration gates

- All documented UI and CLI mutations work against the same HTTP API and PostgreSQL data.
- A second browser sees updates; concurrent writes do not silently discard unrelated cards.
- Auth protects reads, mutations and dispatch; production cannot accidentally expose an open board.
- Keep the GitHub Pages personal/demo board usable with the same shared appearance. Clearly distinguish device-local demo storage from the self-hosted shared application.
- Configuration examples, setup, migrations, auth, API, CLI and phase reports describe commands that actually run.
- Real PostgreSQL integration tests, meaningful plan/auth/dispatcher tests, production build and browser workflows pass; repositories and published Pages are synchronized.

The public agent examples are acceptance criteria, not decorative JSON: `board --json` must expose readyToMerge, waves, blocked, needsBreakdown, humanAssigned and gated classifications with correct behavior.
