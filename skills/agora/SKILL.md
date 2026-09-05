---
name: agora
description: Use the Agora HTTP CLI to select and update authorized coding tasks from a shared board, respecting dependencies, human ownership, and review or merge policy.
---

Use the installed `agora` executable (or `node /path/to/agora.mjs`). It needs a
configured board URL and API token. Run `agora help` for the available commands;
use `agora login --url ORIGIN` or operator-provided AGORA_URL/AGORA_TOKEN when
connection setup is part of the request. Never put tokens in comments or logs.

Read `agora board --json`. It returns board, revision, public workflow,
readyToMerge, waves, blocked, needsBreakdown, humanAssigned, gated, and runnableNow.
Items include full task context, policy, prerequisites and explicit reasons.
Use configured column IDs selected by semantic role; labels and agent names do
not imply behavior.

For authorized development, choose a task assigned to your declared agent identity
from runnableNow (the first wave). Later waves describe future work and cannot
start until a fresh plan makes them runnable. Respect the user's chosen task and
scope; if it is blocked, explain the reported reason rather than choosing unrelated
work. Human, unknown or unset assignments are never permission to take a task.
A human-review gate, including an ancestor gate, must be resolved before starting.
Epics and parents are containers. An empty epic needs breakdown, not execution.

Read `agora get ID` before a mutation. Use its revision with `--revision N` for
changes based on that read. A conflict requires a fresh read and reconciliation;
never blindly overwrite, clear dependencies or reassign ownership to get past it.
Post concise progress/results through `agora comment ID < notes.md`; the server
assigns the authenticated author. Comments also change the revision.

Choose one execution path within existing authorization:

- If doing the work yourself, move the task to the configured doing column with
  `agora move ID COLUMN --revision N`, then carry out the requested repository
  work and relevant tests.
- If authorized to use the configured dispatcher, generate a UUID and run
  `agora dispatch ID --revision N --idempotency-key UUID`. Keep the receipt, key
  and original revision. Do not also execute the task yourself. A pending or
  uncertain outcome may already have started work: inspect
  `agora dispatch-status DISPATCH_ID` and the receiver. Repeating the exact
  original request retrieves the reservation; do not create a new key to force a
  replay. Succeeded means accepted, not completed.

When implementation and tests are ready, open a PR only within the user's and
repository's existing authorization. Record its URL and the configured review
column through `agora edit ID --revision N --data JSON`, for example a JSON object
with `prUrl` and `column`. Comment with the change, test evidence and remaining
review needs. Preserve assignee, dependencies, parent, gates and merge policy
unless explicitly authorized to change them.

Review-stage tasks with a PR appear in readyToMerge. `mergeAllowed` expresses the
card's automerge policy only; a PR URL or this classification is not approval.
Merge automatically only when automerge is enabled, required tests/checks and
reviews pass, no applicable human gate remains, and user/repository authorization
allows the merge. Otherwise leave it for human review. Do not enable automerge or
clear review gates to bypass approval. After verified completion, move to the
configured done column or archive according to the board's workflow; re-read the
plan before selecting another task.

Unexpected discoveries outside the current task can be recorded with
`agora suggest --stdin` as a JSON draft plus optional `--reason TEXT`.
Suggestions require browser review before becoming cards; they do not authorize
extra work. Preserve the user's task scope and existing permissions throughout.
