# Contributing to Agora

Agora includes a personal browser board and a shared PostgreSQL application for
human and agent workflows. Bug reports from running either mode are welcome.

## Getting set up

Use Node 20.9+ and the pnpm version in `package.json`. For the personal board:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

For shared development, start the optional local database and migrate it:

```sh
docker compose up -d db
export DATABASE_URL=postgres://agora:agora@localhost:5432/agora
export AGORA_AUTH=none
pnpm db:migrate
pnpm dev
```

The development listener binds to loopback. Production requires password or
trusted-proxy authentication; see [setup](docs/DATABASE.md) and [auth](docs/AUTH.md).

## Before opening a pull request

```sh
pnpm verify
pnpm build
pnpm test:e2e
```

The personal app and Pages browser tests start their own servers. For shared
changes, use a separate local test database and run these suites sequentially:

```sh
export TEST_DATABASE_URL=postgres://agora:agora@localhost:5432/agora_test
pnpm verify
pnpm test:db
pnpm test:e2e:shared
pnpm test:e2e:suggestions
```

Create the test database first; tests create and remove unique schemas inside it.
Without `TEST_DATABASE_URL`, unit verification skips database suites. GitHub CI
provides PostgreSQL and runs the full verification and browser suites. Browser
tests use installed Google Chrome locally and Playwright Chromium in CI. Avoid
concurrent browser commands because they share production build output.

## Conventions

- Keep SQL parameterized in `lib/server/`; test database behavior against real
  PostgreSQL when changing queries or transactions.
- Append migrations in `db/migrations/` with the next numbered filename. Never
  rewrite an applied migration; checksums enforce migration history.
- Use the shared planner for dependency readiness and dispatch eligibility.
  Preserve human assignments, review gates, and revision conflict behavior.
- Keep the personal and shared board UI consistent. Changes to shared components
  must work on desktop and mobile in both the app and Pages.
- Use vendored Stoa design tokens and recipes. See the README for synchronized
  package and site asset updates.
- Record phase acceptance evidence in `docs/phases/` and keep public behavior
  claims consistent with verified implementation.

## Reporting a security issue

See [SECURITY.md](SECURITY.md); please do not open a public issue.

## License

Contributions are accepted under the MIT license that covers this project.
