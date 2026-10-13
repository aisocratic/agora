"use client"

import type { ReactNode } from "react"
import { LogoMark } from "@aisocratic/design/brand"
import { ThemeToggle } from "@aisocratic/design/components/theme-toggle"
import { Board, type WorkspacePage } from "@/components/board/board"
import type { BoardController } from "@/lib/board-storage"
import type { Workflow } from "@/lib/workflow"

/* The workspace chrome. The product board and the demo dashboard both render
   this, so the two surfaces stay one UI with different data behind them. */
/* projects is where the workspace's pages live: a path base such as "" or
   "/admin/todo" (<base>/board, /projects, /calendar, /list, and per project
   <base>/project/<slug>[/projects|/calendar|/list]), or "query" for the static
   demo, which can only take ?view=…&project=…. page and scopeSlug say which
   of those pages this is. */
export function workspaceHref(projects: string, page: WorkspacePage, slug?: string) {
  if (projects === "query") return `?view=${page}${slug ? `&project=${encodeURIComponent(slug)}` : ""}`
  if (slug) return `${projects}/project/${encodeURIComponent(slug)}${page === "board" ? "" : `/${page}`}`
  return `${projects}/${page}`
}
export function WorkspaceShell({ store, mode, workflow, homeHref = "/", actions, preferencesKey, projects, scopeSlug, page = "board" }: {
  store?: BoardController
  mode?: "local" | "shared"
  workflow?: Workflow
  homeHref?: string
  actions?: ReactNode
  preferencesKey?: string
  projects?: string
  scopeSlug?: string
  page?: WorkspacePage
}) {
  const base = projects
  const projectHref = base === undefined ? undefined : (slug: string) => workspaceHref(base, "board", slug)
  const pageHref = base === undefined ? undefined : (target: WorkspacePage) => workspaceHref(base, target, scopeSlug)
  const projectsHref = base === undefined ? "/" : workspaceHref(base, page)
  const scopeHref = base === undefined ? undefined : (slug?: string) => workspaceHref(base, page, slug)
  return <main className="agora-dashboard agora-test-shell">
    <Board workspace store={store} mode={mode} workflow={workflow} preferencesKey={preferencesKey} scopeSlug={scopeSlug} projectHref={projectHref} projectsHref={projectsHref} page={page} pageHref={pageHref} scopeHref={scopeHref} workspaceNav={
      <nav className="agora-dashboard-nav" aria-label="Workspace">
        <a href={homeHref} aria-label="Agora home" className="agora-brand"><LogoMark size={24} aria-hidden="true" />Agora</a>
      </nav>
    } workspaceActions={<>{actions}<ThemeToggle /></>} />
  </main>
}
