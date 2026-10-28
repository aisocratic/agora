"use client"

import { useState } from "react"
import { BoardStore } from "@/lib/board-storage"
import { DEMO_BOARD, DEMO_STORAGE_KEY, DEMO_WORKFLOW } from "@/lib/demo-board"
import { WorkspaceShell } from "@/components/board/workspace-shell"
import type { WorkspacePage } from "@/components/board/board"

/* The demo dashboard: the same workspace as the product board at `/`, backed by
   a seeded board in its own storage key so changes here are safe to try. */
export function TestDashboard({ homeHref = "/", projects, scopeSlug, page }: { homeHref?: string; projects?: string; scopeSlug?: string; page?: WorkspacePage }) {
  const [store] = useState(() => new BoardStore({
    read: () => window.localStorage.getItem(DEMO_STORAGE_KEY) ?? JSON.stringify(DEMO_BOARD),
    write: value => window.localStorage.setItem(DEMO_STORAGE_KEY, value),
    subscribe(listener) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === DEMO_STORAGE_KEY || event.key === null) listener()
      }
      window.addEventListener("storage", onStorage)
      return () => window.removeEventListener("storage", onStorage)
    },
  }, DEMO_WORKFLOW))
  // The static demo can't serve extra paths, so it reads ?view= and ?project=.
  const [route] = useState(() => {
    if (projects !== "query" || typeof window === "undefined") return { slug: scopeSlug, page }
    const query = new URLSearchParams(window.location.search)
    const view = query.get("view")
    return { slug: query.get("project") ?? undefined, page: (view === "projects" || view === "calendar" || view === "list" ? view : "board") as WorkspacePage }
  })
  return <WorkspaceShell store={store} workflow={DEMO_WORKFLOW} homeHref={homeHref} preferencesKey="agora.test-dashboard.view.v2" projects={projects} scopeSlug={route.slug} page={route.page} />
}
