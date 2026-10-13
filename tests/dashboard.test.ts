import { dueLabel, dueSortKey, findScope, overdue, projectGroups, slugify, withinScope, monthWindow, projectNodes, sortCards, timelinePosition, timelineSpan } from "../lib/board-view"
import { taskFieldsSchema } from "../lib/task-fields"
import { describe, expect, it } from "vitest"
import { DEMO_BOARD, DEMO_STORAGE_KEY, DEMO_WORKFLOW } from "../lib/demo-board"
import { BOARD_STORAGE_KEY } from "../lib/board-storage"
import { parseBoard, updateBoard } from "../lib/board"
import { workflowSchema } from "../lib/workflow"

describe("test dashboard data", () => {
  it("has valid hierarchy and workflow without using the personal board key", () => {
    expect(DEMO_STORAGE_KEY).not.toBe(BOARD_STORAGE_KEY)
    expect(workflowSchema.parse(DEMO_WORKFLOW)).toEqual(DEMO_WORKFLOW)
    const board = parseBoard(JSON.stringify(DEMO_BOARD))
    expect(board.cards.some(card => card.parentId)).toBe(true)
    expect(board.cards.every(card => DEMO_WORKFLOW.columns.some(column => column.id === card.column))).toBe(true)
  })

  it("preserves priority and flags through edit, move, and export/import", () => {
    const original = DEMO_BOARD.cards[0]
    let board = updateBoard(DEMO_BOARD, { type: "edit", id: original.id, draft: { ...original, priority: 3, needsHumanReview: true } })
    board = updateBoard(board, { type: "move", id: original.id, column: "review", position: 0 })
    expect(parseBoard(JSON.stringify(board)).cards.find(card => card.id === original.id)).toMatchObject({ priority: 3, needsHumanReview: true, column: "review" })
    expect(DEMO_BOARD.cards[0].priority).toBe(1)
  })

  it("rejects invalid priority while accepting legacy cards without it", () => {
    const card = { ...DEMO_BOARD.cards[0] }
    delete card.priority
    expect(() => parseBoard(JSON.stringify({ version: 1, cards: [card] }))).not.toThrow()
    for (const priority of [0, 4, 1.5, "high"]) {
      expect(() => parseBoard(JSON.stringify({ version: 1, cards: [{ ...card, priority }] }))).toThrow()
    }
  })
})

describe("reference board ordering and Project semantics", () => {
  it("sorts priorities without mutating stored manual order", () => {
    const before = DEMO_BOARD.cards.map(card => card.id)
    const sorted = sortCards(DEMO_BOARD.cards, "priority-desc")
    expect(sorted[0].priority).toBe(3)
    expect(sorted.at(-1)?.priority).toBe(1)
    expect(DEMO_BOARD.cards.map(card => card.id)).toEqual(before)
    expect(sortCards(DEMO_BOARD.cards, "manual")).toBe(DEMO_BOARD.cards)
  })
  it("breaks ties consistently even when the source order changes", () => {
    expect(sortCards([...DEMO_BOARD.cards].reverse(), "priority-desc")).toEqual(sortCards(DEMO_BOARD.cards, "priority-desc"))
  })
  it("groups work under the project it rolls up to, through intermediate epics", () => {
    const { groups, loose } = projectGroups(DEMO_BOARD.cards, DEMO_WORKFLOW)
    expect(groups.map(group => group.project.title)).toEqual(["Agent-ready workspace", "Agent dispatch", "Agora launch"])
    // Tasks parented to an epic still roll up to that epic's project.
    const titles = groups[0].cards.map(card => card.title)
    expect(titles).toContain("Ship the dashboard")
    expect(titles).toContain("Fix mobile column scrolling")
    expect(titles).not.toContain("Agent-ready workspace")
    expect(loose.every(card => !titles.includes(card.title))).toBe(true)
    expect(loose.map(card => card.title)).toContain("Review the empty states")
  })
  it("never loses a card to a parent cycle", () => {
    const cards = DEMO_BOARD.cards.map(card => card.id === "demo-1" ? { ...card, parentId: "demo-2" } : card)
    const { groups, loose } = projectGroups(cards, DEMO_WORKFLOW)
    expect(groups.length + loose.length).toBeGreaterThan(0)
  })
})

describe("project timeline", () => {
  it("nests tasks under their epic and leaves the rest standing on their own", () => {
    const { groups } = projectGroups(DEMO_BOARD.cards, DEMO_WORKFLOW)
    const nodes = projectNodes(groups[0].cards, DEMO_WORKFLOW)
    const epic = nodes.find(node => node.card.title === "Ship the dashboard")
    expect(epic?.children.map(card => card.title)).toEqual(expect.arrayContaining(["Polish the card metadata", "Fix mobile column scrolling", "Build the test dashboard"]))
    // A task shown under its epic is not repeated at the top level.
    expect(nodes.map(node => node.card.title)).not.toContain("Polish the card metadata")
    // Loose work has no parents in the group, so every card is its own row.
    const { loose } = projectGroups(DEMO_BOARD.cards, DEMO_WORKFLOW)
    expect(projectNodes(loose, DEMO_WORKFLOW).every(node => node.children.length === 0)).toBe(true)
  })
  it("windows whole months from a start month, across a year end", () => {
    expect(monthWindow("2026-10", 1)).toEqual(["2026-10"])
    expect(monthWindow("2026-11", 3)).toEqual(["2026-11", "2026-12", "2027-01"])
    expect(monthWindow("2026-10", 12).at(-1)).toBe("2027-09")
  })
  it("places a day proportionally and clamps outside the range", () => {
    const months = ["2026-09", "2026-10"]
    expect(timelinePosition("2026-09-01T00:00:00Z", months)).toBeCloseTo(0.5 / 30 / 2)
    expect(timelinePosition("2026-10-31T00:00:00Z", months)).toBeCloseTo((1 + 30.5 / 31) / 2)
    expect(timelinePosition("2025-01-01T00:00:00Z", months)).toBe(0)
    expect(timelinePosition("2027-01-01T00:00:00Z", months)).toBe(1)
    const span = timelineSpan({ ...DEMO_BOARD.cards[0], createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-05T00:00:00Z" }, months)
    expect(span?.end).toBe(span?.start)
    // Work that started and ended before the window, or starts after it, has no bar.
    const stretch = (createdAt: string, updatedAt: string) => timelineSpan({ ...DEMO_BOARD.cards[0], createdAt, updatedAt }, months)
    expect(stretch("2026-07-01T00:00:00Z", "2026-08-20T00:00:00Z")).toBeNull()
    expect(stretch("2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z")).toBeNull()
    // Work that began earlier but is still active is clipped to the window's start.
    expect(stretch("2026-07-01T00:00:00Z", "2026-09-16T00:00:00Z")?.start).toBe(0)
  })
})

describe("target dates and project images", () => {
  const base = DEMO_BOARD.cards.find(card => card.title === "Add keyboard shortcuts")!
  it("accepts a day or a month, and rejects anything else", () => {
    for (const dueDate of ["2026-11-18", "2026-12", null]) expect(taskFieldsSchema.parse({ dueDate }).dueDate).toBe(dueDate)
    for (const dueDate of ["2026-02-30", "2026-13", "18/11/2026", "2026-1-5"]) expect(() => taskFieldsSchema.parse({ dueDate })).toThrow()
  })
  it("takes web image URLs and small uploaded raster images, nothing else", () => {
    for (const imageUrl of ["https://example.com/logo.svg", "https://example.com/logo.png#dark", "data:image/webp;base64,AAAA", "data:image/png;base64,AAAA#dark"])
      expect(taskFieldsSchema.parse({ imageUrl }).imageUrl).toBe(imageUrl)
    for (const imageUrl of ["javascript:alert(1)", "data:text/html;base64,AAAA", "data:image/svg+xml;base64,AAAA", "ftp://example.com/a.png", `data:image/png;base64,${"A".repeat(200_000)}`])
      expect(() => taskFieldsSchema.parse({ imageUrl })).toThrow()
  })
  it("labels, sorts and flags work by its target", () => {
    expect(dueLabel({ ...base, dueDate: "2026-11-18" })).toBe("Nov 18, 2026")
    expect(dueLabel({ ...base, dueDate: "2026-12" })).toBe("December 2026 · day TBD")
    expect(dueLabel({ ...base, dueDate: null })).toBeNull()
    // A month-only target sorts after every day in that month; undated work comes last.
    const keys = [{ ...base, dueDate: "2026-12" }, { ...base, dueDate: null }, { ...base, dueDate: "2026-12-31" }].map(dueSortKey).sort()
    expect(keys[0]).toBe("2026-12-31")
    expect(keys[2].startsWith("~")).toBe(true)
    expect(overdue({ ...base, column: "todo", dueDate: "2026-10-01" }, DEMO_WORKFLOW, "2026-10-07")).toBe(true)
    expect(overdue({ ...base, column: "done", dueDate: "2026-10-01" }, DEMO_WORKFLOW, "2026-10-07")).toBe(false)
    expect(overdue({ ...base, column: "todo", dueDate: "2026-10" }, DEMO_WORKFLOW, "2026-10-07")).toBe(false)
  })
})

describe("project pages", () => {
  const cards = DEMO_BOARD.cards
  it("slugs titles for the address bar", () => {
    expect(slugify("AI Socratic")).toBe("ai-socratic")
    expect(slugify("On-Device Agents · Liquid AI")).toBe("on-device-agents-liquid-ai")
    expect(slugify("Café Été")).toBe("cafe-ete")
    expect(slugify("···")).toBe("untitled")
  })
  it("finds a project by slug, typed title or ID, but never a task", () => {
    expect(findScope(cards, DEMO_WORKFLOW, "agora-launch")?.title).toBe("Agora launch")
    expect(findScope(cards, DEMO_WORKFLOW, "Agora%20launch")?.title).toBe("Agora launch")
    expect(findScope(cards, DEMO_WORKFLOW, "demo-15")?.title).toBe("Agora launch")
    expect(findScope(cards, DEMO_WORKFLOW, "public-demo-site")?.type).toBe("epic")
    expect(findScope(cards, DEMO_WORKFLOW, "add-keyboard-shortcuts")).toBeUndefined()
    expect(findScope(cards, DEMO_WORKFLOW, "%E0%A4%A")).toBeUndefined()
  })
  it("scopes a card when the project sits anywhere above it", () => {
    const grandchild = cards.find(card => card.title === "Record the walkthrough GIF")!
    expect(withinScope(cards, grandchild, "demo-15")).toBe(true)
    expect(withinScope(cards, grandchild, "demo-1")).toBe(false)
    const looped = cards.map(card => card.id === "demo-15" ? { ...card, parentId: "demo-16" } : card)
    expect(withinScope(looped, grandchild, "demo-99")).toBe(false)
  })
})
