# Dispatching agent tasks

Shared authenticated users and tokens can dispatch a saved, configured leaf task
assigned to an agent in a `todo` column. Epic/container cards, human or unknown
assignees, human-review gates (including ancestor gates), incomplete task/ancestor
dependencies, archived cards and unknown runtime settings block dispatch.
`automerge` does not bypass the human-review gate. The editor disables dispatch
while an unsaved draft is present. The Pages board has no dispatcher.

The server reserves a durable dispatch ID and moves the task to the first `doing`
column in one revision-checked Postgres transaction before contacting an adapter.
A unique key and a unique card/revision reservation prevent duplicate work from
double clicks or concurrent retries. The default `none` adapter records `disabled`
and advances the revision without moving the card or contacting anything.

`pending` means a reservation exists but no outcome has been confirmed;
`succeeded` means the adapter accepted the request, not that work finished.
`uncertain` means delivery or execution may have occurred. Timeouts, rejected
responses, process failures and lost replies cannot prove that no work started.
No reservation is automatically replayed, including after a server crash.
Inspect the receiver using the dispatch ID before deliberately creating new work.
Reuse the **original revision and idempotency key** to retrieve the original
receipt. GET `/api/dispatch/:id` is also available to authenticated clients.

## Operator adapters

Set `dispatcher` in `agora.config.ts` or the complete JSON configuration selected
by `AGORA_CONFIG_FILE`. Only trusted operators choose adapters, destinations,
executables and arguments. Requests cannot override these settings.

```ts
{ type: "none" }
{ type: "webhook", url: "https://runner.example/jobs", secretEnv: "AGORA_WEBHOOK_SECRET", timeoutMs: 15000 }
{ type: "command", executable: "/usr/local/bin/node", args: ["/opt/agora/runner.mjs"], cwd: "/opt/project", timeoutMs: 15000 }
{ type: "github", owner: "your-org", repo: "your-repo", workflow: "agent.yml", ref: "main", tokenEnv: "AGORA_GITHUB_TOKEN", timeoutMs: 15000 }
```

Timeouts are integers from 100 to 60,000 ms (default 15,000). HTTP adapters refuse
redirects and cap response bodies at 64 KiB. Use HTTPS for remote webhooks;
loopback HTTP supports local receiver testing. The webhook secret must have at
least 32 characters. Payloads are JSON `{ version: 1, dispatchId, card }`.
`Idempotency-Key` equals the durable dispatch ID. `X-Agora-Timestamp` contains
Unix seconds, and `X-Agora-Signature` is `v1=` followed by hex HMAC-SHA256 of the
exact timestamp, a dot, and the exact raw JSON body. Verify before parsing, reject
stale timestamps, and deduplicate IDs in a durable job queue. See the
[receiver example](../examples/dispatch/verify-webhook.mjs).

Command dispatch additionally requires `AGORA_ALLOW_COMMAND_DISPATCH=1`. It uses
`execFile` with a fixed absolute executable, configured argument array, no shell,
JSON stdin, and a minimal environment (`PATH`, `LANG`, `NODE_ENV`, dispatch ID).
Database/auth secrets are not inherited. Output is capped at 64 KiB and the direct
process is killed on timeout. Descendant work may continue, so prefer a durable
queue for long-running agents. Runner credentials must be provisioned separately.
Task descriptions are untrusted prompts; use a restricted execution account,
workspace and runner permissions appropriate for every board member.

GitHub dispatch fixes the owner/repository/workflow/ref in trusted configuration,
sends the JSON payload through the single string input `agora`, and requires a
token with Actions write permission. Configure a workflow declaring that input;
the supplied [workflow example](../examples/dispatch/github-workflow.yml) only
validates the payload. See GitHub's [workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).

## CLI and runner examples

```sh
agora board --json
agora dispatch CARD_ID --revision 12 --idempotency-key 6bd683df-8144-42ee-92f3-992e29de8ce9
agora dispatch-status DISPATCH_ID
```

Keep the receipt, revision and key. The CLI's 15-second request timeout can expire
before a longer configured adapter deadline; check status or repeat the original
request to inspect its reservation. A 202 response includes pending/uncertain
status explicitly and is not evidence of completion.

[Codex](../examples/dispatch/codex.mjs) and
[Claude Code](../examples/dispatch/claude-code.mjs) wrappers accept a trusted
absolute runner path as their configured first argument and forward the card
through stdin. Codex uses `exec --sandbox workspace-write --json` with stdin `-`;
Claude uses `--print --output-format json` and optionally `--model`/`--effort`.
These flags were checked against installed CLI help; Codex behavior is also
covered by its [official noninteractive documentation](https://developers.openai.com/codex/noninteractive/).
Select a model/effort supported by the installed runner. Examples are scaffolds
for operator review, not automatic installation or credential setup. Verification
uses harmless Node processes and local receivers; no real agent was launched.
