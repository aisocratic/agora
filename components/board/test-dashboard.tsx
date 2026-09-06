"use client"

import { useState } from "react"
import { LogoMark } from "@aisocratic/design/brand"
import { LayoutGrid } from "lucide-react"
import { ThemeToggle } from "@aisocratic/design/components/theme-toggle"
import { Board } from "@/components/board/board"
import { BoardStore } from "@/lib/board-storage"
import { DEMO_BOARD, DEMO_STORAGE_KEY, DEMO_WORKFLOW } from "@/lib/demo-board"

export function TestDashboard({ homeHref = "/" }: { homeHref?: string }) {
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
  }))
  return <main className="agora-dashboard agora-test-shell">
    <Board workspace store={store} workflow={DEMO_WORKFLOW} workspaceNav={
      <nav className="agora-dashboard-nav" aria-label="Workspace">
        <a href={homeHref} aria-label="Agora home" className="agora-brand"><LogoMark size={24} aria-hidden="true" />Agora</a>
        <strong className="agora-workspace-tab"><LayoutGrid size={14} />Cards</strong>
      </nav>
    } workspaceActions={<ThemeToggle />} />
  </main>
}
