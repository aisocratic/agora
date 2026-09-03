# Agora

**A kanban board built for humans and coding agents.**

Website: [aisocratic.github.io/agora](https://aisocratic.github.io/agora/)

Most boards assume a person moves every card. Agora assumes some of the work is
done by coding agents, and makes that a first-class part of the model: a card
carries a PR link, an automerge flag, a review verdict, and its own model /
effort / harness policy. A dependency graph decides what is actually workable
right now, so an agent can ask the board what to do next instead of guessing.

Turn the agent half off with one config flag and you have a fast, keyboard-driven
kanban board for people.

> **Status: early.** The board is being extracted from a private codebase where
> it has been in daily use. Phases land incrementally — see
> [the roadmap](#roadmap). Not yet ready to run.

## Why it exists

- **The dependency graph is the point.** Cards declare prerequisites. Agora
  computes waves of genuinely-unblocked work, so parallel agents don't collide
  and nothing starts before what it depends on is real.
- **Review is a gate, not a column.** `needs_human_review` blocks work *before*
  it starts; `automerge` governs only the merge at the end. The two are
  deliberately separate, because "I want to look at this first" and "you may
  merge this without me" are different questions.
- **Agents get an API and a CLI, not a scraper.** Everything the web UI does is
  a documented HTTP endpoint with token auth. `npx agora board` returns the plan
  as JSON.
- **You own the data.** One Postgres database, plain SQL, no ORM, no vendor.

## Quick start

```bash
git clone https://github.com/aisocratic/agora && cd agora
pnpm install
docker compose up -d db        # or set DATABASE_URL to any Postgres 14+
pnpm setup                     # writes .env.local, migrates, seeds a demo board
pnpm dev
```

Open http://localhost:3000.

## How agents use it

```bash
npx agora login --url https://board.example.com
npx agora board --json          # what's ready, in dependency order
npx agora get <id>              # card, comments, dependencies, children
npx agora comment <id> --author claude < notes.md
npx agora move <id> review
```

`agora skill install` drops a Claude Code skill into your project that teaches an
agent the whole loop — pick a card, work it, open a PR, respect the review gate.

## Dispatching

Agora does not run agents. It tells something else to, through one small
adapter interface:

| adapter | what it does |
|---|---|
| `none` | default — no dispatch, a purely human board |
| `webhook` | POSTs the card and its context to a URL you control, HMAC-signed |
| `command` | runs a process on the server (opt-in; it executes code) |
| `github-workflow` | triggers a `workflow_dispatch` |

Claude Code and Codex ship as ~15-line examples in `examples/dispatch/`, not as
built-in adapters — vendor CLI flags churn faster than releases.

## Configuration

`agora.config.ts` at the repo root: column and type labels, the people who can be
assigned, whether the agent half is enabled, and the values your `effort` /
`model` / `harness` fields accept. Changing that vocabulary never requires a
migration.

## Security model

Agora's trust boundary is **the database and the deployment**, not an in-app
permission system. There are no user accounts and no roles: anyone who can reach
the board can edit the board. Assignees are free text.

That is a deliberate choice, not an omission. Adding roles without an identity
provider is security theatre. Run it on localhost, behind Tailscale, or behind a
proxy that authenticates for you (`AGORA_AUTH=proxy`), or set a shared password
(`AGORA_AUTH=password`). Machine clients use bearer tokens. See `docs/AUTH.md`.

## Roadmap

- [x] **Phase 0** — scaffold, fonts, design system ([`@aisocratic/stoa`](https://github.com/aisocratic/stoa))
- [ ] **Phase 1** — the board on Postgres: columns, drag and drop, card editor, live refresh
- [ ] **Phase 2** — auth, API tokens, CLI
- [ ] **Phase 3** — configurable vocabulary, dispatcher adapters
- [ ] **Phase 4** — the plan engine and the Claude Code skill
- [ ] **Phase 5** — the suggestions inbox: agents propose, humans dispose
- [ ] **Phase 6** — dependency graph view

## Development

```bash
pnpm verify      # typecheck + lint + unit tests
pnpm test:e2e    # Playwright
```

Stack: Next.js 16, React 19, Tailwind v4, `pg` with hand-written SQL, dnd-kit,
Postgres 14+. No ORM — the queries are SQL you can paste into psql.

## License

MIT © AI Socratic. The look comes from [`@aisocratic/stoa`](https://github.com/aisocratic/stoa),
the AI Socratic design system. Fonts are Space Grotesk, Newsreader and JetBrains
Mono, all under the SIL Open Font License 1.1 and self-hosted at build time.
