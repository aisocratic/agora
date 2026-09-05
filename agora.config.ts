import { DEFAULT_WORKFLOW } from "./lib/workflow"

// Trusted operator configuration. Only workflow is exposed to browsers.
// Changes to this TypeScript file require a rebuild, never a database migration.
const configuration = {
  workflow: DEFAULT_WORKFLOW,
  dispatcher: { type: "none" as const },
}

export default configuration
