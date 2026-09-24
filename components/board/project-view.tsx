"use client"

import { useState } from "react"
import type { BoardCard } from "../../lib/board"
import type { Workflow } from "../../lib/workflow"
import { projectGroups } from "../../lib/board-view"

/* One section per project, listing the epics and tasks it breaks down into. */
export function ProjectView({ cards, workflow, onOpen }: { cards: BoardCard[]; workflow: Workflow; onOpen: (card: BoardCard) => void }) {
  const [expanded, setExpanded] = useState<string[]>([])
  const { groups, loose } = projectGroups(cards, workflow)
  if (!groups.length && !loose.length) return <p className="agora-focus-empty">No projects yet. Create a project card to plan work at the top level.</p>
  const sections = [
    ...groups.map(group => ({ key: group.project.id, label: group.project.title, project: group.project, cards: group.cards })),
    ...(loose.length ? [{ key: "__loose__", label: "Not in a project", project: undefined, cards: loose }] : []),
  ]
  return <div className="agora-focus-sections" aria-label="Project cards">
    {sections.map(section => {
      const showAll = expanded.includes(section.key)
      return <section key={section.key} className="agora-focus">
        <h3>
          {section.project
            ? <button className="agora-focus-project" onClick={() => onOpen(section.project!)}>{section.label}</button>
            : section.label}
          <span>{section.cards.length}</span>
        </h3>
        {section.cards.length === 0 && <p className="agora-focus-empty">Nothing broken out yet.</p>}
        {(showAll ? section.cards : section.cards.slice(0, 8)).map(card => <button className="agora-focus-row" key={card.id} onClick={() => onOpen(card)}>
          <i className="agora-priority-dot" data-priority={card.priority ?? 1} title={`${["Low", "Medium", "High"][(card.priority ?? 1) - 1]} priority`} />
          <span className="agora-focus-title">{card.title}</span>
          <span className="agora-badge" data-tone={card.column}>{workflow.columns.find(column => column.id === card.column)?.label}</span>
          {card.assignee && <span className="agora-avatar" title={card.assignee}>{card.assignee.slice(0, 2).toUpperCase()}</span>}
        </button>)}
        {section.cards.length > 8 && <button className="agora-focus-more" onClick={() => setExpanded(showAll ? expanded.filter(key => key !== section.key) : [...expanded, section.key])}>{showAll ? "Show less" : `… ${section.cards.length - 8} more`}</button>}
      </section>
    })}
  </div>
}
