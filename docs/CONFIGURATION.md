# Workflow configuration

The shared server validates `agora.config.ts` on every configuration read. It
exports `{ workflow, dispatcher }`. A trusted operator can instead set
`AGORA_CONFIG_FILE` to an absolute JSON file containing that same complete object;
replace the file atomically when changing it. Invalid or unknown settings fail
closed with a generic 503. Configuration is deployment policy, never task input.

Only `workflow` reaches the browser through the server page and authenticated
`GET /api/board`. Dispatcher URLs, executable paths, credential environment names
and values stay on the server. The static Pages bundle uses `DEFAULT_WORKFLOW`
from `lib/workflow.ts`; it never imports the server configuration.

```ts
const configuration = {
  workflow: {
    columns: [
      { id: "ideas", label: "Ideas", role: "backlog" },
      { id: "ready", label: "Ready", role: "todo" },
      { id: "active", label: "In progress", role: "doing" },
      { id: "checking", label: "Review", role: "review" },
      { id: "finished", label: "Done", role: "done" },
    ],
    types: [
      { id: "work", label: "Work item", kind: "task" },
      { id: "initiative", label: "Initiative", kind: "epic" },
    ],
    people: [
      { id: "maintainer", label: "Maintainer", kind: "human" },
      { id: "builder", label: "Builder", kind: "agent" },
    ],
    agents: {
      enabled: true,
      efforts: ["low", "medium", "high"],
      models: ["default"],
      harnesses: ["claude-code", "codex"],
    },
  },
  dispatcher: { type: "none" as const },
}
export default configuration
```

IDs use lowercase letters, digits, `_` and `-`, start with a letter, and have at
most 64 characters. IDs must be unique within each list. Columns and types must
be nonempty. Labels have at most 100 characters. Runtime option lists cannot
contain duplicates. Configure model names accepted by your installed runner;
Agora does not fetch provider catalogs or infer agents from their names.

Column roles and type/person kinds determine behavior independently of labels.
Dispatch requires a `todo` role and moves accepted reservations to the first
`doing` role. Archived cards or cards in a `done` role satisfy dependencies. The
original four-column Pages workflow uses archive for completion. `agents.enabled`
false blocks dispatch while retaining existing metadata. See the
[planner contract](PLANNER-CONTRACT.md) for subsequent scheduling semantics.

New or changed column/type/assignee/runtime values must be configured. Existing
values removed from configuration stay in storage and the editor, labelled
`(unconfigured)`; historical columns remain visible. Users can preserve them
while editing other fields, or explicitly select current values. Backup imports
preserve historical vocabulary. No SQL migration is required for a label or ID
change. A workflow hash participates in the polling ETag, so clients refresh
configuration even when the board revision stays unchanged.

The editor also exposes parent/dependency links, PR URL, automerge and human-review
gates. Parent and dependency cycles and missing references are rejected. Comments
are attributed by the authenticated principal in shared mode and remain portable
in personal-board backups. Assignees are workflow metadata, not access roles.
