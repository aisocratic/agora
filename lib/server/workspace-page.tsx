import { getPublicWorkflow } from "@/lib/server/configuration"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { authorizeRequest, type Principal } from "@/lib/server/authorization"
import { LogoutButton } from "@/components/auth/logout-button"
import { WorkspaceShell } from "@/components/board/workspace-shell"
import type { WorkspacePage } from "@/components/board/board"

export const WORKSPACE_PAGES: WorkspacePage[] = ["board", "projects", "calendar", "list"]

/* The product board at one of its pages, optionally scoped to one project by
   its URL slug. */
export async function renderWorkspace(page: WorkspacePage, scopeSlug?: string) {
  const shared = Boolean(process.env.DATABASE_URL)
  let principal: Principal | null = null
  if (shared) {
    try { principal = await authorizeRequest(new Request("http://localhost/", { headers: await headers() })) }
    catch { redirect("/login") }
  }
  /* The workspace carries its own nav and theme toggle, so the board is the
     whole page here; Stoa's site header belongs to the marketing site. */
  return (
    <WorkspaceShell
      mode={shared ? "shared" : "local"}
      workflow={shared ? await getPublicWorkflow() : undefined}
      actions={principal?.kind === "session" ? <LogoutButton /> : null}
      preferencesKey="agora.workspace.view.v1"
      projects=""
      page={page}
      scopeSlug={scopeSlug}
    />
  )
}
