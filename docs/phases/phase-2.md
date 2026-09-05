# Phase 2: authentication, API tokens and standalone CLI

Status: complete, verified 2026-09-05. No commits, pushes or registry publication
performed. Operator instructions are in [AUTH.md](../AUTH.md), [API.md](../API.md)
and [CLI.md](../CLI.md). The CLI's package remains private until a release owner
deliberately configures publication.

## Delivered

- Explicit local/password/proxy modes. Missing/malformed shared configuration
  fails closed; production always refuses local `none`. Development binds to
  127.0.0.1. Shared page access is checked on the server before rendering the
  board; unauthenticated visitors are redirected to the sign-in/setup page.
- Password sign-in uses scrypt verification and a distinct signing secret.
  Sessions carry an HMAC-signed 12-hour expiry and opaque random ID, whose hash
  lives in Postgres. Cookies are HttpOnly, SameSite=Strict, Path=/ and Secure in
  production. Logout revokes the database row. Password/secret rotation invalidates
  previous signatures. A database-backed 10-attempt/15-minute shared login budget
  works across processes and does not trust forwarding headers.
- Named 32+ character API tokens with fixed-length hash/constant-time comparison.
  Invalid Bearer credentials never fall back to cookies, proxy identity or local
  access. Principals preserve `{ name }` attribution and add `kind` as `local`,
  `session`, `token` or `proxy` for future policy integration.
- Trusted proxy mode requires an authenticated user header plus the configured
  X-Agora-Proxy-Secret. Documentation explicitly requires stripping inbound
  headers and a private proxy/app network; no socket-peer claim or XFF trust is
  implied. AGORA_PUBLIC_ORIGIN defines the external same-origin mutation boundary,
  including deployments behind TLS-terminating proxies.
- A dependency-free `cli/agora.mjs` and private `cli/package.json` with executable
  `agora`. Login validates API credentials before atomic 0600 storage; secrets
  can come from hidden terminal input, stdin or environment. URLs are validated,
  redirects refused, and URL overrides do not reuse another origin's stored token.
  Commands cover board/get/create/edit/move/comment/archive/restore/delete and
  additive backup import/export. Mutations expose revision conflicts without
  blind retry. JSON output preserves the server envelope for Phase 4 planning.
- API/session/browser and CLI error handling has explicit input/auth/conflict/
  network behavior and does not print remote error bodies or credentials.
  Comment --author is accepted only when it matches the authenticated name.

## Evidence

All database verification used the parent-provided isolated local Postgres 14
database, with unique temporary schemas. Shared browser fixtures now use port
4290 so they can run independently from Atlas's ports. Their production app uses
real password/session/token configuration; no production-none test bypass exists.

| Verification | Result |
| --- | --- |
| `TEST_DATABASE_URL=… pnpm verify` | 40 tests passed, including real database suites; design integrity, strict TypeScript and lint passed |
| `pnpm test:db` with isolated DB | 13 tests passed: Phase 1 relational/API checks plus production session/tamper/expiry/revocation, CSRF/Bearer and persistent rate limiting |
| Production build | Passed with authenticated page, login and auth/board/card API routes |
| Shared Playwright suite | 5 passed: blocked unauthenticated pages/APIs, password login and logout, existing two-client CRUD/conflict/network/mobile checks, and real CLI workflows |
| Copied/packed CLI | Copied into a temporary directory outside the clone, executed with Node, packed with npm, then invoked through offline npm exec from its tarball; no app or database dependencies |
| CLI workflow coverage | Verified private credential file and non-disclosure, identity, create/edit/move/get/comment author, stale revision rejection, archive/restore/delete, backup export/import, JSON board, invalid token and logout |
| HTTP stub tests | Invalid/insecure URLs, error status mapping, invalid JSON, network failure and redirect refusal passed |
| Existing personal-board Playwright | 25 passed, 5 existing device-specific skips across Pages desktop/mobile and the local Next.js app |
| `git diff --check` | Passed |

Browser tests caught the CLI entrypoint comparison failing on macOS's /var to
/private/var path alias. The standalone entrypoint now resolves its actual path,
which also supports npm's executable symlinks; the outside-clone and packed tests
exercise this behavior.

## Phase 3 handoff

Every current protected API calls `authorizeRequest(request, mutation?)` before
database work. It returns `Principal { name, kind }`. Reuse it for dispatch and
future suggestion routes; authenticate before outbound effects. Browser mutation
requests require Origin, while valid Bearer clients may omit it. Preserve
`AGORA_PUBLIC_ORIGIN` semantics rather than inferring identity or trust from Host
or X-Forwarded-For.

The CLI has no imports from the app and forwards the complete `board --json`
response. Extend that one file for dispatch and later plan/skill commands. Preserve
its revision-conflict exit code (4), token confidentiality, strict option parsing,
copy/pack execution and public API usage. Keep package publication private.

The default Pages consumer remains unauthenticated local browser storage. Auth UI
is exclusive to Next.js, so configurable board vocabulary/editor changes must
continue to avoid importing server configuration or secrets into the static bundle.
The global password throttle can be exhausted by a hostile visitor; the documented
deployment contract includes a front-proxy rate limit for public installations.
