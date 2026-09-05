# Security Policy

## Reporting a vulnerability

Email **security@aisocratic.org**. Please do not open a public issue.
Include what you found, reproduction steps and potential impact. We aim to
acknowledge within 72 hours.

## Trust model

Agora has one shared board and no per-card roles. Anyone authenticated with a
session, API token or trusted proxy identity can read and mutate every card.
Assignees are task metadata, not access-control identities. The GitHub Pages
personal board stores data in its own browser and has no server credentials.

Shared access requires explicit configuration. Production refuses `AGORA_AUTH=none`
and fails closed for missing/malformed settings. Choose password or trusted-proxy
mode and set the external `AGORA_PUBLIC_ORIGIN`; use HTTPS for a remote deployment.
See [AUTH.md](docs/AUTH.md) for exact settings and [API.md](docs/API.md) for the
protected endpoints.

Password sessions use scrypt verification, signed 12-hour expiries, hashed random
identifiers in Postgres, HttpOnly/SameSite=Strict cookies and Secure in production.
Logout revokes the database session. Changing the password/session secret also
invalidates existing signatures. Protect secrets outside source control and
restart every instance when rotating configuration.

The login throttle is database-backed and global to the shared password: ten
attempts per 15 minutes. Attackers can exhaust this budget temporarily. Use a
trusted front-proxy rate limit for internet-facing deployments. Agora does not
trust X-Forwarded-For for authentication or throttle identity.

Proxy mode requires the configured user header **and** a valid
X-Agora-Proxy-Secret. The proxy must authenticate users, strip spoofed incoming
headers and overwrite them before forwarding. Keep the app on a private network
reachable only by the proxy and protect the shared secret in transit. Agora does
not claim a socket peer/range check through Next's Request API. A forged identity
header by itself is rejected.

API tokens are full-access bearer credentials, at least 32 characters, compared
using fixed-length hashes and constant-time equality. Invalid Authorization
headers never fall back to other modes. Rotate/revoke tokens in environment
configuration and restart all instances. The standalone CLI stores credentials
with mode 0600, rejects insecure remote URLs and does not follow redirects with
credentials. Protect its configuration file and any exported board backups.

Browser login/logout/mutations require the configured same origin. Database
queries are parameterized; shared mutations check the board revision and execute
transactionally. Errors do not expose infrastructure credentials. Auth does not
replace database backups or your deployment's network controls.

`pnpm dev` binds to 127.0.0.1. Explicit development `none` mode also requires a
loopback host, but Host is not proof of the network peer; do not expose or proxy
that listener. Production does not offer an unauthenticated bypass.

## Agent execution

Every authenticated board member can request dispatch. Only trusted operator
configuration selects a destination, executable, argument array or GitHub
workflow/ref; task input cannot override these. Command dispatch requires the
explicit `AGORA_ALLOW_COMMAND_DISPATCH=1` opt-in and runs without a shell or
inherited database/auth secrets. Treat anyone who can create cards as able to
influence dispatched task content. Restrict the runner's account and workspace.

Webhook signing provides authenticity, not confidentiality; receivers must verify
the exact raw signed body and timestamp, deduplicate durable dispatch IDs and use
TLS. Timeouts cap the direct command or HTTP request, not all downstream work.
An uncertain result is never automatically replayed. See
[DISPATCH.md](docs/DISPATCH.md) for reservation and recovery semantics.

## Supported versions

Agora is pre-1.0. Security fixes land on main and the next release; there are no
backports yet.
