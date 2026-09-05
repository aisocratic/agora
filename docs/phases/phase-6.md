# Phase 6: dependency graph

Status: complete, verified 2026-09-05. Final release integration and publication remain parent-managed gates.

## Delivered

- Shared React graph on the PostgreSQL application and device-local Pages board, with the same planner determining eligibility, reasons, expanded leaf dependencies and inherited parent dependencies.
- Directed prerequisite-to-dependent arrows, status labels, selectable nodes, searchable card list, prerequisite/dependent navigation, and the existing card editor for dependency changes.
- Pointer pan, zoom/fit controls, keyboard pan/fit/zoom, keyboard node selection and Enter to edit. Mobile relationship details appear ahead of the searchable list with accessible controls and no page overflow.
- Helpful empty and no-search-results states; planner cycle/missing-reference reasons remain available for historical data, and attempted cyclic editor changes are rejected without discarding the draft.
- Large graphs retain every node and edge. Fixed the minimum zoom that previously clipped a 1,000-card graph at a 390px viewport; the fit test now verifies both dimensions actually fit.

## Verification

- `pnpm verify`: design integrity, TypeScript, ESLint and 54 non-database tests passed; 26 database tests were explicitly skipped without a test URL.
- `pnpm exec vitest run tests/graph.test.ts`: all six tests passed, including deterministic diamonds/isolated cards, inherited/expanded dependencies, planner classifications, cycle/missing endpoints, completed edges, and 1,000-card layout/fit.
- `TEST_DATABASE_URL=postgres://…/agora_graph_test pnpm test`: all 80 tests passed against the dedicated local database, including all 26 database cases.
- Production `pnpm build` passed during the Pages/Next graph suite.
- `pnpm exec playwright test tests/e2e/graph.spec.ts`: three passed (Pages desktop/mobile and Next local desktop).
- Shared PostgreSQL Playwright suite: nine passed, including graph editor workflows at 1280px and 390px, independent browsers/live refresh/conflict safety, auth, CLI, planner and rich fields/comments.
- Graph workflows create real cards through the editor, check directed SVG endpoints and planner statuses, fit/zoom/pan, navigate relationships and keyboard focus, edit through Enter, reject cycles while retaining drafts, save valid edits, reload, and check no-result/mobile overflow behavior.
- Live browser inspection confirmed Pages graph empty state, card creation with dependencies, legible directed arrows and fit behavior on desktop and at 390px.
- Corrected the shared rich-editor test's saved-comment assertion to target the comment paragraph, avoiding an ambiguous match with the transient textarea draft on CI.

The shared tests use a temporary schema in a dedicated loopback PostgreSQL test database and remove it after each run. Browser regression files are included by the existing CI Pages and shared jobs; no additional CI command is needed.

## Release handoff

Run the complete final regression/CI and suggestions browser gates, audit setup/security documentation and public status, then synchronize main and published Pages. Phase completion does not itself claim those release gates or an npm registry publication.
