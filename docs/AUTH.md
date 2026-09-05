# Shared access

Agora has one shared board and no per-card roles. Every authenticated session,
proxy identity or API token can read and mutate board cards. Suggestions may be
submitted and read with API tokens; reviewing, accepting and dismissing them
requires a human browser principal. See [SUGGESTIONS.md](SUGGESTIONS.md).
Assignees are task metadata;
they do not grant access. The Pages personal board is public application code
with data stored privately in each browser and needs no server authentication.

A shared Next.js app requires an explicit `AGORA_AUTH` mode. Missing or malformed
configuration fails closed. `none` is always rejected in production, even when
API tokens exist. The server checks access before rendering the shared page;
unauthenticated visitors go to `/login`, and protected API reads return 401.

## Password mode

```sh
export DATABASE_URL=postgres://agora:agora@localhost:5432/agora
export AGORA_AUTH=password
export AGORA_ACCESS_PASSWORD='replace-with-a-long-random-password'
export AGORA_SESSION_SECRET="$(openssl rand -hex 32)"
export AGORA_PUBLIC_ORIGIN=https://board.example.com
pnpm db:migrate
pnpm build
pnpm start
```

Choose a random password of at least 16 characters and a distinct session secret
of at least 32 characters. Keep both in your deployment's secret store. The
example password is a placeholder, not a credential to deploy. Production requires
`AGORA_PUBLIC_ORIGIN`: the browser-facing origin with scheme and port, without a
path, credentials, query or fragment. Use HTTPS; HTTP is permitted only for
loopback development and production-build testing. Serve production behind TLS.

The sign-in form verifies the shared password using scrypt and creates a random
session whose identifier is stored hashed in Postgres. The cookie contains an
HMAC-signed expiry and opaque ID. It lasts 12 hours and uses `HttpOnly`,
`SameSite=Strict`, `Path=/`, and `Secure` in production. Sessions also require an
unexpired database row. Logout revokes that row and clears the cookie. Rotating
the password or session secret immediately invalidates previously signed cookies.
Restart all instances with the same updated configuration.

Password attempts share a database-backed budget of 10 per 15 minutes across all
processes. Successful sign-in resets the budget. A throttled request returns 429
with `Retry-After: 900`. Because there is one shared password, the budget is global;
a hostile visitor can temporarily exhaust it. Keep a front-proxy rate limit for
public deployments. Agora never uses `X-Forwarded-For` to invent a trusted client
identity or let attackers rotate their throttle key.

Login, logout and browser mutations require the exact configured Origin. Requests
marked cross-site are rejected. Bearer clients may omit Origin; if supplied it
must still match. `AGORA_PUBLIC_ORIGIN` also handles TLS-terminating proxies and
Next.js's reconstructed internal request URL. No wildcard origins are accepted.

## Named API tokens

```sh
export AGORA_API_TOKENS="claude:$(openssl rand -hex 32),ci:$(openssl rand -hex 32)"
```

Entries are comma-separated `name:secret` pairs. Names use letters, digits, dots,
underscores and hyphens, up to 100 characters. Secrets are 32–512 characters,
without whitespace, commas or colons. Names and secrets must be unique. Treat
tokens as full-access bearer credentials and transmit them only over HTTPS.
Malformed token configuration makes shared access unavailable instead of silently
ignoring an entry. Comparisons use fixed-length hashes and constant-time equality.
An invalid or malformed Authorization header never falls back to a session,
proxy identity or local mode.

Send `Authorization: Bearer TOKEN` on every request. Comment authors come from
the authenticated token name. Rotate or revoke a token by changing configuration
and restarting all instances. API tokens do not bypass invalid production auth
configuration; select password or proxy mode for the shared deployment.

## Trusted proxy mode

```sh
export AGORA_AUTH=proxy
export AGORA_PUBLIC_ORIGIN=https://board.example.com
export AGORA_TRUSTED_USER_HEADER=X-Authenticated-User
export AGORA_PROXY_SECRET="$(openssl rand -hex 32)"
```

Your proxy must authenticate the user, strip any incoming identity and
`X-Agora-Proxy-Secret` headers, then set the configured identity header and
`X-Agora-Proxy-Secret` to the shared secret on the internal upstream request.
Agora checks that secret with constant-time comparison before accepting a name.
A spoofed identity header or `X-Forwarded-For` alone grants no access.

Restrict the application listener to the proxy's private network and keep the
secret confidential on that network, preferably using TLS between proxy and app.
This mode uses an explicit secret/network contract, not an inferred peer-address
check: Next's web Request does not expose a trustworthy socket peer here. Set
logout/session policy at your identity gateway; Agora's password logout does not
log a proxy user out of that gateway. Named API tokens also work in proxy mode.

## Explicit local development

```sh
export AGORA_AUTH=none
export DATABASE_URL=postgres://agora:agora@localhost:5432/agora
pnpm db:migrate
pnpm dev
```

`pnpm dev` binds to `127.0.0.1`. Local mode also requires a loopback request host.
A Host header is not proof of the socket peer: keep this listener on loopback and
do not forward or expose it. `next start` always uses production policy and
refuses `none`; use real password/token configuration to test production builds.
Without `DATABASE_URL`, the local browser board remains available independently
of shared-server auth configuration.
