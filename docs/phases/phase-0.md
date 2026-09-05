# Phase 0 acceptance: scaffold, design substrate, fonts

Status: complete. Audited on 2026-09-05 against commit
`fee245aa1fe732d26e01e510c59ff6e9d4a1552e` and the original numbered roadmap in
`site/index.html`. No application changes were required for this phase.

## Acceptance evidence

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Scaffold | Next.js 16.3, React 19, strict TypeScript, Tailwind v4/PostCSS, App Router layout and page, standalone production output. The shared board also has an esbuild entry for GitHub Pages. | `pnpm build` passed, including TypeScript and prerendering `/` and `/_not-found`. `pnpm lint` and `pnpm site:build` passed. |
| Design substrate | `app/globals.css` imports `@aisocratic/design/tailwind.css`; the app uses its header, wordmark, section, theme toggle and toaster. `site/index.html` loads the vendored shared CSS before project styles. The app and site use the shared board component and styles. | `pnpm design:check` passed for both vendored assets and their matching design version, 0.2.0. The dependency is a committed local archive, so no sibling checkout is required. |
| Fonts | `app/fonts.ts` configures Space Grotesk 400/500, Newsreader 200 normal/italic and JetBrains Mono 400/500 through `next/font/google`. `app/layout.tsx` applies their three `--aisocratic-font-*` variables to `<html>`. The static site requests the same families/weights from Google Fonts and uses the design package's family fallbacks. | The production output contains 15 WOFF2 assets, four font preload links and all three font slots in emitted CSS. The prerendered app HTML contains no Google Fonts runtime links. Both consumers build successfully. |

Verified design CSS SHA-256:
`19bba569514f7f2721a1fb85f82f127786e3f0598f00fcbc72b2e50e3f292a38`.

Verified design archive SHA-256:
`ef1a08044bb76963a3740b4aa73bd74f6f267f1e65ff96fc8ead3a9656a50e8b`.

This acceptance concerns scaffold and asset integration. Full board unit/browser
suites were not rerun for this documentation-only audit. Google Fonts are fetched
at app build time; the static site fetches its font stylesheet at runtime.

## Phase 1 handoff: the board on Postgres

The existing UI already supplies columns, drag/reorder and the card editor.
Persistence currently lives in browser local storage, with storage-event refresh
between tabs of the same origin. It does not provide server persistence or shared
updates between devices.

`lib/board.ts` defines `BoardData` as `{ version: 1, cards: BoardCard[] }`. Each card
has `id`, `title`, `description`, `column`, `archived`, `createdAt` and `updatedAt`.
The columns are `backlog`, `todo`, `doing` and `review`; array order determines card
order within each column. Preserve ordering explicitly in the database.
`parseBoard(raw)` validates serialized data, and `updateBoard(board, action, now?)`
applies immutable `create`, `edit`, `move`, `archive`, `restore` and `delete`
operations. Delete requires an archived card.

`lib/board-storage.ts` exposes this synchronous adapter:

```ts
interface BoardStorage {
  read(): string | null
  write(value: string): void
  subscribe(listener: () => void): () => void
}
```

`BoardStore` accepts that adapter and provides:

- `getSnapshot()` and `getServerSnapshot()` for `{ board, ready, error, readOnly,
  unsaved }`; `subscribe(listener)` publishes changes to React.
- `connect()` loads the initial state, subscribes to external storage changes and
  returns cleanup. Refresh avoids overwriting unsaved local changes.
- `dispatch(action)` reads the latest stored board before mutation, validates the
  action, writes the result and publishes it. Write failure retains unsaved edits;
  malformed persisted data becomes read-only and is retained for backup.
- `export()` returns the original malformed backup or the current board JSON.
  `replace(raw)` validates and requires a successful write before replacing state.

`components/board/board.tsx` accepts an optional concrete `BoardStore`, creates a
browser store by default and connects it using `useSyncExternalStore`. Mutation,
import and reset handlers assume synchronous calls and immediately report success
or catch exceptions. `site/board-entry.tsx` uses the default browser store.

Postgres access therefore needs a server repository/API plus an asynchronous
client contract; it cannot directly replace the synchronous storage adapter.
Update the UI's success/error and pending handling with that contract, preserve
the static site's local mode, and keep database credentials server-side. Add
migrations and transactional ordering/mutations with a concurrency strategy so
two clients cannot silently overwrite one another. Implement live refresh via
polling or a push channel, and test persistence across server restart and refresh
between independent clients. The `pg` dependency exists, but no database schema,
migrations, repository or API routes existed at this audit baseline. Auth/API
tokens/CLI remain the numbered Phase 2 responsibility.
