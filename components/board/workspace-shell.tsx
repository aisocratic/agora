"use client"

import type { ReactNode } from "react"
import { LogoMark } from "@aisocratic/design/brand"
import { ThemeToggle } from "@aisocratic/design/components/theme-toggle"
import { Board } from "@/components/board/board"
import type { BoardController } from "@/lib/board-storage"
import type { Workflow } from "@/lib/workflow"

/* The workspace chrome. The product board and the demo dashboard both render
   this, so the two surfaces stay one UI with different data behind them. */
export function WorkspaceShell({ store, mode, workflow, homeHref = "/", actions, preferencesKey }: {
  store?: BoardController
  mode?: "local" | "shared"
  workflow?: Workflow
  homeHref?: string
  actions?: ReactNode
  preferencesKey?: string
}) {
  return <main className="agora-dashboard agora-test-shell">
    <Board workspace store={store} mode={mode} workflow={workflow} preferencesKey={preferencesKey} workspaceNav={
      <nav className="agora-dashboard-nav" aria-label="Workspace">
        <a href={homeHref} aria-label="Agora home" className="agora-brand"><LogoMark size={24} aria-hidden="true" />Agora</a>
      </nav>
    } workspaceActions={<>{actions}<ThemeToggle /></>} />
  </main>
}
