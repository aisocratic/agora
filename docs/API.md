# Authenticated HTTP API

The board/card contract is documented in [DATABASE.md](DATABASE.md). All shared
reads and mutations call `authorizeRequest` before touching board data. Responses
use JSON. API tokens have full board access; there are no per-card roles.

| Endpoint | Authentication and behavior |
| --- | --- |
| `POST /api/auth/login` | Same-origin `{ "password": "..." }`; sets a signed session cookie on success; 401 incorrect password, 429 throttled |
| `POST /api/auth/logout` | Same-origin; revokes the current password session and clears its cookie; idempotent |
| `GET /api/auth/session` | Returns `{ "name": "...", "kind": "session\|token\|proxy\|local" }`; 401 if unauthenticated |
| `GET /api/board` | Authenticated `{ board, revision, workflow, ...planning }`, ETag/304 polling including public configuration changes |
| `GET /api/plan` | Same authenticated revisioned planning envelope as board GET |
| `POST /api/board` | Authenticated `{ action, revision }`; browser sessions additionally require Origin |
| `PUT /api/board` | Authenticated additive backup import `{ board, revision }` |
| `GET /api/cards/:id` | Authenticated card/comments/dependencies and current board revision |
| `POST /api/cards/:id/comments` | Authenticated `{ body, revision }`; author assigned from the principal |
| `POST /api/cards/:id/dispatch` | Authenticated `{ revision, idempotencyKey: UUID }`; returns `{ board, revision, dispatch }`, 202 for pending/uncertain outcomes |
| `GET /api/dispatch/:id` | Authenticated durable dispatch receipt `{ id, cardId, revision, status, message }` |

Send `Authorization: Bearer TOKEN` for CLI/agent access. Invalid Bearer credentials
never fall back to another mode. For browser requests use the HttpOnly session
cookie; clients cannot read that cookie from JavaScript. Configure
`AGORA_PUBLIC_ORIGIN` to the external board origin and send that exact Origin on
login/logout/session mutations. No Origin is needed for a non-browser token
client, but a supplied cross-origin value is rejected.

401 means credentials are missing/invalid; 403 means the request violates the
origin/local trust boundary; 409 means a stale revision; 503 means authentication
configuration or storage is unavailable. Configuration failures never include
secrets. Login responses and session responses disable caching.

All mutations preserve the Phase 1 revision contract. The authenticated principal
is `{ name, kind }`; integrations should use it for attribution and future policy,
never user-supplied `author` fields. See [AUTH.md](AUTH.md) for deployment modes,
session lifetime, proxy requirements and token rotation.

See [CONFIGURATION.md](CONFIGURATION.md) for allowed workflow values and
[DISPATCH.md](DISPATCH.md) for eligibility, exact webhook signatures and durable
idempotency. Dispatch retries must retain the original revision and key.

[PLANNING.md](PLANNING.md) defines `readyToMerge`, `waves`, `blocked`,
`needsBreakdown`, `humanAssigned`, `gated`, expanded edges and `runnableNow`.
Only the current first wave can dispatch; future waves do not grant readiness.
