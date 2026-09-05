# Dispatch examples

Read [the dispatch operator guide](../../docs/DISPATCH.md) before configuring a
runner. These files do not install, authenticate or launch an agent automatically.

- `verify-webhook.mjs`: importable raw-body signature verifier; add a durable queue
  that deduplicates `dispatchId` before acknowledging delivery.
- `codex.mjs`: JSON-stdin adapter around an operator-supplied absolute Codex path.
- `claude-code.mjs`: JSON-stdin adapter around an operator-supplied absolute Claude
  Code path.
- `github-workflow.yml`: configured `workflow_dispatch` input validation, with no
  agent execution.

For a reviewed command wrapper, configure an absolute Node executable with an
argument array such as `["/opt/agora/examples/dispatch/codex.mjs",
"/opt/runners/codex"]`, a trusted workspace `cwd`, and explicit command opt-in.
Provision runner authentication separately; Agora does not forward its server
secrets. Short-lived queue submission is preferable to a long-running direct
process. A timeout can leave downstream work running and yields an uncertain
receipt, which must be investigated before creating another dispatch.
