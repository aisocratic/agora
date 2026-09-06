"use client"

import { useState } from "react"
import type { BoardCard } from "../../lib/board"
import type { Workflow } from "../../lib/workflow"
import { focusCards } from "../../lib/board-view"

export function FocusView({ cards, workflow, onOpen }: { cards: BoardCard[]; workflow: Workflow; onOpen: (card: BoardCard) => void }) {
  const [showAll, setShowAll] = useState(false)
  const { inProgress, upNext } = focusCards(cards, workflow)
  if (!inProgress.length && !upNext.length) return <p className="agora-focus-empty">Nothing in progress or up next. Enjoy the calm.</p>
  return <div className="agora-focus-sections" aria-label="Focus cards">
    {[{ label: "In Progress", cards: inProgress }, { label: "Up Next", cards: upNext }].filter(section => section.cards.length).map(section => <section key={section.label} className="agora-focus">
      <h3>{section.label}<span>{section.cards.length}</span></h3>
      {(section.label === "Up Next" && !showAll ? section.cards.slice(0, 8) : section.cards).map(card => <button className="agora-focus-row" key={card.id} onClick={() => onOpen(card)}>
        <i className="agora-priority-dot" data-priority={card.priority ?? 1} title={`${["Low", "Medium", "High"][(card.priority ?? 1) - 1]} priority`} />
        <span className="agora-focus-title">{card.title}</span>
        {section.label === "In Progress" && <span className="agora-badge" data-tone={card.column}>{workflow.columns.find(column => column.id === card.column)?.label}</span>}
        {card.assignee && <span className="agora-avatar" title={card.assignee}>{card.assignee.slice(0, 2).toUpperCase()}</span>}
      </button>)}
      {section.label === "Up Next" && upNext.length > 8 && <button className="agora-focus-more" onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : `… ${upNext.length - 8} more queued`}</button>}
    </section>)}
  </div>
}
