"use client"
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import type { BoardCard, BoardData } from "../../lib/board"
import type { Workflow } from "../../lib/workflow"
import { buildGraph, fitGraph, NODE_HEIGHT, NODE_WIDTH } from "./layout"
import "./graph.css"
export function DependencyGraph({ board, workflow, onOpenCard }: { board: BoardData; workflow: Workflow; onOpenCard: (card: BoardCard) => void }) {
  const graph = useMemo(() => buildGraph(board, workflow), [board, workflow])
  const lookup = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph])
  const [selection, setSelection] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [view, setView] = useState({ x: 24, y: 24, zoom: 1 })
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; viewX: number; viewY: number; id: number } | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const marker = useId().replaceAll(":", "")
  const selected = lookup.get(selection ?? "") ?? graph.nodes[0]
  const matches = graph.nodes.filter(node => `${node.title} ${node.id} ${node.status}`.toLowerCase().includes(query.toLowerCase()))
  function fit() { const bounds = viewport.current?.getBoundingClientRect(); if (bounds) setView(fitGraph(graph.width, graph.height, bounds.width, bounds.height)) }
  function zoom(factor: number) { setView(previous => { const bounds = viewport.current?.getBoundingClientRect(); const next = Math.max(.001, Math.min(2, previous.zoom * factor)); const cx = (bounds?.width ?? 500) / 2, cy = (bounds?.height ?? 500) / 2; return { zoom: next, x: cx - (cx - previous.x) * next / previous.zoom, y: cy - (cy - previous.y) * next / previous.zoom } }) }
  function select(id: string, focus = false) {
    setSelection(id); const node = lookup.get(id), bounds = viewport.current?.getBoundingClientRect()
    if (node && bounds) setView(previous => ({ zoom: Math.max(.65, previous.zoom), x: bounds.width / 2 - (node.x + NODE_WIDTH / 2) * Math.max(.65, previous.zoom), y: bounds.height / 2 - (node.y + NODE_HEIGHT / 2) * Math.max(.65, previous.zoom) }))
    if (focus) buttons.current.get(id)?.focus({ preventScroll: true })
  }
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const delta = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[event.key]
    if (delta) { event.preventDefault(); setView(previous => ({ ...previous, x: previous.x + delta[0], y: previous.y + delta[1] })) }
    if (["+", "=", "-", "0"].includes(event.key)) { event.preventDefault(); if (event.key === "0") fit(); else zoom(event.key === "-" ? 1 / 1.2 : 1.2) }
  }
  if (!graph.nodes.length) return <section className="agora-graph-empty"><h3>No cards to connect yet</h3><p>Create a card, then add dependencies in its task settings. Cards without dependencies appear here too.</p></section>
  const prerequisites = graph.edges.filter(edge => edge.to === selected?.id).map(edge => edge.from)
  const dependents = graph.edges.filter(edge => edge.from === selected?.id).map(edge => edge.to)
  return <section className="agora-graph" aria-label="Dependency graph">
    <div className="graph-toolbar"><p>{graph.nodes.length} cards · {graph.edges.length} dependencies<span>Arrows point from prerequisite to dependent.</span></p><div className="agora-actions"><button className="agora-btn" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">−</button><output aria-label="Graph zoom">{Math.round(view.zoom * 100)}%</output><button className="agora-btn" onClick={() => zoom(1.2)} aria-label="Zoom in">+</button><button className="agora-btn" onClick={fit}>Fit graph</button></div></div>
    <p className="graph-help" id={`${marker}-help`}>Drag the background to pan. Use arrow keys on the graph to pan, + or − to zoom, and 0 to fit. On a card, arrow keys select another card and Enter opens it.</p>
    {graph.nodes.length > 100 && <p className="graph-help">This is a large graph. Fit shows the whole board; use Find a card below to focus on a task and its relationships.</p>}
    <div ref={viewport} className="graph-viewport" role="group" aria-label="Interactive dependency map" aria-describedby={`${marker}-help`} tabIndex={0} onKeyDown={keys}
      onPointerDown={event => { if ((event.target as HTMLElement).closest("button")) return; drag.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, id: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { const current = drag.current; if (current?.id === event.pointerId) setView(previous => ({ ...previous, x: current.viewX + event.clientX - current.x, y: current.viewY + event.clientY - current.y })) }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onWheel={event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1) } }}>
      <div className="graph-stage" style={{ width: graph.width, height: graph.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className="graph-edges" width={graph.width} height={graph.height} aria-hidden="true"><defs><marker id={marker} markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0 0 L10 4 L0 8 Z" fill="currentColor" /></marker></defs>{graph.edges.map(edge => {
          const from = lookup.get(edge.from)!, to = lookup.get(edge.to)!, x1 = from.x + NODE_WIDTH, y1 = from.y + NODE_HEIGHT / 2, x2 = to.x - 3, y2 = to.y + NODE_HEIGHT / 2
          const bend = Math.max(45, Math.abs(x2 - x1) / 2)
          return <path key={`${edge.from}:${edge.to}`} data-from={edge.from} data-to={edge.to} className={edge.from === selected?.id || edge.to === selected?.id ? "graph-edge selected" : "graph-edge"} d={`M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`} markerEnd={`url(#${marker})`} />
        })}</svg>
        {graph.nodes.map((node, index) => <button key={node.id} ref={element => { if (element) buttons.current.set(node.id, element); else buttons.current.delete(node.id) }} type="button" className="graph-node" data-status={node.status} data-card-id={node.id} aria-label={`Select ${node.title}`} aria-pressed={selected?.id === node.id} tabIndex={selected?.id === node.id ? 0 : -1} style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }} onClick={() => setSelection(node.id)} onDoubleClick={() => node.card && onOpenCard(node.card)} onKeyDown={event => {
          if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? graph.nodes.length - 1 : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + graph.nodes.length) % graph.nodes.length; select(graph.nodes[next].id, true) }
          if (event.key === "Enter" && node.card) { event.preventDefault(); onOpenCard(node.card) }
        }}><strong>{node.title}</strong><span>{node.status}</span><small>{node.card ? `${workflow.columns.find(column => column.id === node.card!.column)?.label ?? node.card.column} · ${workflow.people.find(person => person.id === node.card!.assignee)?.label ?? node.card.assignee ?? "Unassigned"}` : "Repair this reference"}</small></button>)}
      </div>
    </div>
    <div className="graph-bottom">
      <section className="graph-search" aria-label="Graph card list"><label htmlFor={`${marker}-search`}>Find a card</label><input id={`${marker}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, ID or status" /><p>{matches.length} matching cards</p><ul>{matches.map(node => <li key={node.id}><button type="button" className="graph-list-button" aria-pressed={selected?.id === node.id} onClick={() => select(node.id)}>{node.title}<span>{node.status}</span></button></li>)}</ul>{!matches.length && <p>No matching cards. Try a different title or status.</p>}</section>
      {selected && <section className="graph-detail" aria-label="Selected card relationships"><h3>{selected.title}</h3><p><strong>{selected.status}</strong>{selected.card?.parentId && <> · Parent: {lookup.get(selected.card.parentId)?.title ?? selected.card.parentId}</>}</p>{selected.reasons.length > 0 && <ul>{selected.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reason.message}{reason.relatedIds.length > 0 && <span className="graph-related">{reason.relatedIds.map(id => lookup.get(id)?.title ?? id).join(", ")}</span>}</li>)}</ul>}{selected.status === "Container" && <p>This parent groups child work; executable leaves appear in the planner waves.</p>}{selected.card && <button type="button" className="agora-btn agora-primary" onClick={() => onOpenCard(selected.card!)}>Open card and edit dependencies</button>}
      {[["Prerequisites", prerequisites], ["Dependents", dependents]].map(([label, ids]) => <div key={label as string}><h4>{label as string}</h4>{(ids as string[]).length ? <ul>{(ids as string[]).map(id => <li key={id}><button className="graph-relation" onClick={() => select(id)}>{lookup.get(id)?.title ?? id}</button></li>)}</ul> : <p>No {(label as string).toLowerCase()}.</p>}</div>)}<p className="graph-help">Relationships include inherited parent dependencies and prerequisites expanded to child tasks.</p></section>}
    </div>
  </section>
}
