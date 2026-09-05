import { describe, expect, it } from "vitest"
import type { BoardCard, BoardData } from "../lib/board"
import { planBoard } from "../lib/planner"
import { DEFAULT_WORKFLOW } from "../lib/workflow"
import { buildGraph, fitGraph, NODE_HEIGHT, NODE_WIDTH } from "../components/graph/layout"
const card = (id: string, fields: Partial<BoardCard> = {}): BoardCard => ({ id, title: id, description: "", column: "todo", assignee: "claude", type: "task", archived: false, createdAt: "2026-09-05T00:00:00Z", updatedAt: "2026-09-05T00:00:00Z", ...fields })
const board = (...cards: BoardCard[]): BoardData => ({ version: 1, cards })
describe("planner-backed graph layout", () => {
  it("keeps deterministic prerequisite direction across branches, diamonds and isolated cards", () => {
    const input = board(card("a"), card("b", { dependencies: ["a"] }), card("c", { dependencies: ["a"] }), card("d", { dependencies: ["b", "c"] }), card("isolated"))
    const graph = buildGraph(input, DEFAULT_WORKFLOW), nodes = new Map(graph.nodes.map(node => [node.id, node]))
    expect(graph.edges).toEqual(planBoard(input, DEFAULT_WORKFLOW).edges)
    for (const edge of graph.edges) expect(nodes.get(edge.from)!.x).toBeLessThan(nodes.get(edge.to)!.x)
    expect(buildGraph({ ...input, cards: input.cards.toReversed() }, DEFAULT_WORKFLOW)).toEqual(graph)
    expect(nodes.get("isolated")?.status).toBe("Ready now")
  })
  it("uses inherited parent dependencies and expanded leaf edges from the planner", () => {
    const input = board(card("parent", { type: "epic", dependencies: ["first"] }), card("first"), card("leaf-a", { parentId: "parent" }), card("leaf-b", { parentId: "parent" }), card("last", { dependencies: ["parent"] }))
    const graph = buildGraph(input, DEFAULT_WORKFLOW)
    expect(graph.edges).toEqual(planBoard(input, DEFAULT_WORKFLOW).edges)
    expect(graph.edges).toContainEqual({ from: "first", to: "leaf-a" })
    expect(graph.edges).toContainEqual({ from: "leaf-b", to: "last" })
    expect(graph.nodes.find(node => node.id === "parent")?.status).toBe("Container")
  })
  it("preserves human, gate, unknown, epic and merge reasons without inventing eligibility", () => {
    const input = board(card("human", { assignee: "you" }), card("gate", { needsHumanReview: true }), card("unknown", { assignee: "old" }), card("epic", { type: "epic" }), card("merge", { column: "review", prUrl: "https://example.test/pr/1" }))
    const graph = buildGraph(input, DEFAULT_WORKFLOW), plan = planBoard(input, DEFAULT_WORKFLOW)
    const items = [...plan.humanAssigned, ...plan.gated, ...plan.blocked, ...plan.needsBreakdown, ...plan.readyToMerge]
    for (const node of graph.nodes) expect(node.reasons).toEqual(items.find(item => item.id === node.id)?.reasons)
    expect(graph.nodes.map(node => node.status)).toEqual(["Needs breakdown", "Human review", "Human assigned", "Merge review", "Blocked"])
  })
  it("retains every cyclic/missing edge and presents missing endpoints honestly", () => {
    const input = board(card("a", { dependencies: ["b", "missing"] }), card("b", { dependencies: ["a"] }))
    const graph = buildGraph(input, DEFAULT_WORKFLOW)
    expect(graph.edges).toEqual(planBoard(input, DEFAULT_WORKFLOW).edges)
    expect(graph.nodes).toHaveLength(3)
    expect(graph.nodes.find(node => node.id === "missing")?.status).toBe("Missing card")
    expect(graph.nodes.filter(node => node.reasons.some(reason => reason.code === "dependency-cycle"))).toHaveLength(2)
    expect(new Set(graph.nodes.map(node => `${node.x}:${node.y}`)).size).toBe(3)
  })
  it("retains relations into completed cards while completion remains the planner's decision", () => {
    const input = board(card("a"), card("done", { archived: true, dependencies: ["a"] }))
    const graph = buildGraph(input, DEFAULT_WORKFLOW)
    expect(graph.edges).toContainEqual({ from: "a", to: "done" })
    expect(graph.nodes.find(node => node.id === "done")?.status).toBe("Completed")
  })
  it("lays out 1000 isolated cards without overlap and fits bounded small/large viewports", () => {
    const graph = buildGraph(board(...Array.from({ length: 1000 }, (_, index) => card(`card-${index}`))), DEFAULT_WORKFLOW)
    expect(graph.nodes).toHaveLength(1000)
    expect(new Set(graph.nodes.map(node => `${node.x}:${node.y}`)).size).toBe(1000)
    for (const node of graph.nodes) { expect(node.x + NODE_WIDTH).toBeLessThanOrEqual(graph.width); expect(node.y + NODE_HEIGHT).toBeLessThanOrEqual(graph.height) }
    const fit = fitGraph(graph.width, graph.height, 390, 500)
    expect(fit.zoom).toBeGreaterThan(0); expect(Number.isFinite(fit.x + fit.y)).toBe(true)
    expect(buildGraph(board(), DEFAULT_WORKFLOW).nodes).toEqual([])
  })
})
