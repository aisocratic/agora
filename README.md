# Agora

**A kanban board for humans and coding agents.**

[Open your board](https://aisocratic.github.io/agora/#board)

Agora currently provides a working personal board in your browser. Create cards
with a title and details, move them through Backlog, Todo, Doing and Review,
reorder them, and archive completed work. Restore archived cards or permanently
delete them after confirmation. Drag handles support pointer, touch and keyboard;
column selectors and arrow buttons provide an alternative to dragging.

The GitHub Pages board and the Next.js app use the same React component and state
logic. Cards are saved in local browser storage, separately for each origin and
browser profile. They are **not shared between devices or users**. Export a JSON
backup before clearing browser data. Import adds missing cards and preserves
existing cards with the same IDs. If browser storage is unavailable or full,
Agora keeps changes in the current tab and asks you to export them. Unreadable
saved data is preserved for download before a fresh board can be started.

## Run locally

```sh
git clone https://github.com/aisocratic/agora
cd agora
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. No database or account is needed for the personal board.

To preview the GitHub Pages site, including the same interactive board:

```sh
pnpm site:build
python3 -m http.server 4174 --directory site
```

Open http://localhost:4174. Rebuild after changing the shared board component.
Assets use relative URLs so the site also works under `/agora/` on GitHub Pages.
The Pages workflow installs dependencies, verifies source and design assets, builds
both consumers, tests card workflows, and deploys the static site.

## Verification

```sh
pnpm verify       # design integrity, typecheck, lint, state/storage unit tests
pnpm build        # production Next.js app
pnpm site:build   # shared React board bundled for the static site
pnpm test:e2e     # card workflows in Pages desktop/mobile and the Next app
```

Local browser tests use installed Google Chrome. CI installs Playwright Chromium.
The browser suite covers create/edit, validation/cancel, drag and touch reorder,
column changes, reload persistence, archive/restore/delete, backup import/export,
corrupt data, multiple tabs and responsive layout. Unit tests also cover storage
failures and retaining unsaved edits.

## Architecture

- `components/board/board.tsx` and `board.css`: one board UI for both consumers.
- `lib/board.ts`: validated card data and immutable lifecycle operations.
- `lib/board-storage.ts`: storage interface and browser persistence, with explicit
  error handling and storage-event updates between tabs.
- `site/board-entry.tsx` and `scripts/build-site.mjs`: bundle the shared component
  into `site/assets/board.js` and `board.css` with esbuild.

The storage interface separates persistence from card behavior. A hosted shared
board will require an authenticated API and database adapter; local storage is
not a substitute for shared storage or access control.

## Planned agent workflows

The intended shared platform adds Postgres persistence, authentication, API tokens,
a CLI and dependency-aware scheduling. Cards will carry PR links, review gates,
automerge policy, and model/effort/harness settings. Dispatcher adapters will
connect boards to existing agent runners. These server and agent workflows are
planned; the examples on the project site describe that direction.

- [x] Shared AI Socratic design and responsive browser board
- [x] Card editor, drag and reorder, archive and backup workflows
- [ ] Postgres persistence, shared board updates and authentication
- [ ] API tokens and CLI
- [ ] Agent policies and dispatch adapters
- [ ] Dependency planning and graph view

## Shared design

The app and [GitHub Pages site](https://aisocratic.github.io/agora/) consume
[`@aisocratic/design`](https://github.com/aisocratic/stoa). The app imports its
React chrome and Tailwind theme; the site imports the same tokens and site recipes
in `site/vendor/design.css`. Both use the same board styles, which reference shared
color, typography and spacing roles. Light mode uses the AI Socratic warm palette.

The package archive is pinned inside `vendor/`, so a clean clone works without a
sibling checkout or an unpublished registry package. `vendor/design.json` records
the archive SHA-256; `site/vendor/design.json` records the exact upstream CSS hash.
Fonts fill the package's `--aisocratic-font-*` slots on `<html>`.

To refresh both copies from a built Stoa checkout:

```sh
# In Stoa:
pnpm build
# In Agora:
pnpm design:sync /path/to/stoa
pnpm verify
pnpm build
pnpm site:build
pnpm test:e2e
```

Commit the archive, metadata, CSS, manifest and lockfile together. Keep project
content layout in `site/styles.css`, shared board styling in
`components/board/board.css`, and shared family chrome in Stoa.

MIT © AI Socratic.
