import { describe, expect, it } from "vitest"
import type { BoardCard } from "../lib/board"
import { planBoard } from "../lib/planner"
import { dispatchBlockReason } from "../lib/dispatch-policy"
import { DEFAULT_WORKFLOW } from "../lib/workflow"
const workflow = { ...DEFAULT_WORKFLOW, columns: [...DEFAULT_WORKFLOW.columns, { id: "finished", label: "Finished", role: "done" as const }] }
const card = (id: string, extra: Partial<BoardCard> = {}): BoardCard => ({ id, title: id, description: "Context", column: "todo", archived: false, assignee: "claude", type: "task", createdAt: "2026-09-05T00:00:00Z", updatedAt: "2026-09-05T00:00:00Z", ...extra })
const plan = (...cards: BoardCard[]) => planBoard({ version: 1, cards }, workflow)
const waveIds = (result: ReturnType<typeof plan>) => result.waves.map((wave) => wave.map((item) => item.id))
function unique(result: ReturnType<typeof plan>) {
  const ids = [...result.waves.flat(), ...result.blocked, ...result.needsBreakdown, ...result.humanAssigned, ...result.gated, ...result.readyToMerge].map((item) => item.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(result.waves.flat().filter((item) => item.runnable).map((item) => item.id)).toEqual(result.runnableNow)
}
describe("shared dependency planner", () => {
  it("orders independent branches, chains and diamonds deterministically; only current wave dispatches", () => {
    const cards = [card("d", { dependencies: ["b", "c"] }), card("c", { dependencies: ["a"] }), card("a"), card("b", { dependencies: ["a"] }), card("z")]
    const result = plan(...cards)
    expect(waveIds(result)).toEqual([["a", "z"], ["b", "c"], ["d"]])
    expect(plan(...cards.toReversed())).toEqual(result)
    for (const item of cards) expect(dispatchBlockReason({ version: 1, cards }, item, workflow) === null).toBe(result.runnableNow.includes(item.id))
    unique(result)
  })
  it("expands epic prerequisites to leaves and inherits parent dependencies", () => {
    const result = plan(card("epic", { type: "epic", dependencies: ["first"] }), card("first"), card("leaf-a", { parentId: "epic" }), card("leaf-b", { parentId: "epic" }), card("next", { dependencies: ["epic"] }))
    expect(waveIds(result)).toEqual([["first"], ["leaf-a", "leaf-b"], ["next"]])
    expect(result.containers).toEqual(["epic"])
    expect(result.edges).toContainEqual({ from: "leaf-b", to: "next" })
    unique(result)
  })
  it("retains human, unknown, empty-epic and gate blockers and propagates them", () => {
    const result = plan(card("human", { assignee: "you" }), card("unknown", { assignee: "old-runner" }), card("empty", { type: "epic" }), card("gate", { needsHumanReview: true }), card("dependent", { dependencies: ["human"] }), card("later", { dependencies: ["dependent"] }))
    expect(result.humanAssigned.map((item) => item.id)).toEqual(["human"])
    expect(result.needsBreakdown.map((item) => item.id)).toEqual(["empty"])
    expect(result.gated.map((item) => item.id)).toEqual(["gate"])
    expect(result.blocked.map((item) => item.id)).toEqual(["dependent", "later", "unknown"])
    expect(result.waves).toEqual([]); unique(result)
  })
  it("inherits gates and recognizes archived/done prerequisites without dispatching completed work", () => {
    const result = plan(card("epic", { type: "epic", needsHumanReview: true }), card("child", { parentId: "epic" }), card("done", { column: "finished" }), card("archived", { archived: true }), card("ready", { dependencies: ["done", "archived"] }))
    expect(result.gated[0].id).toBe("child")
    expect(waveIds(result)).toEqual([["ready"]])
    expect(result.completed).toEqual(["archived", "done"]); unique(result)
  })
  it("classifies PR review separately and never treats automerge as a pre-work gate bypass", () => {
    const result = plan(card("manual", { column: "review", prUrl: "https://example.com/pr/1" }), card("auto", { column: "review", prUrl: "https://example.com/pr/2", automerge: true }), card("gated", { needsHumanReview: true, automerge: true }), card("work", { automerge: false }))
    expect(result.readyToMerge.map((item) => [item.id, item.mergeAllowed])).toEqual([["auto", true], ["manual", false]])
    expect(waveIds(result)).toEqual([["work"]]); expect(result.gated[0].id).toBe("gated"); unique(result)
    const unfinished = plan(card("human", { assignee: "you" }), card("review", { column: "review", prUrl: "https://example.com/pr/3", automerge: true, dependencies: ["human"] }))
    expect(unfinished.readyToMerge).toEqual([])
    expect(unfinished.blocked[0].reasons[0].code).toBe("merge-prerequisite")
  })
  it("exposes missing nodes and cycles, including combined hierarchy/dependency cycles", () => {
    for (const cards of [
      [card("a", { dependencies: ["b"] }), card("b", { dependencies: ["a"] })],
      [card("parent", { type: "epic", dependencies: ["child"] }), card("child", { parentId: "parent" })],
      [card("a", { parentId: "b" }), card("b", { parentId: "a" })],
      [card("a", { dependencies: ["missing"] })],
      [card("a", { parentId: "missing" })],
    ]) {
      const result = plan(...cards)
      expect(result.waves).toEqual([])
      expect(result.blocked.length).toBeGreaterThan(0)
      expect(result.blocked.some((item) => item.reasons.some((reason) => /cycle|missing/.test(reason.code)))).toBe(true)
      unique(result)
    }
  })
  it("blocks historical vocabulary, non-ready work, unknown runtime and disabled agents", () => {
    const result = plan(card("column", { column: "retired" }), card("type", { type: "retired" }), card("model", { model: "retired" }), card("doing", { column: "doing" }), card("backlog", { column: "backlog" }))
    expect(result.blocked).toHaveLength(5); expect(result.waves).toEqual([])
    expect(planBoard({ version: 1, cards: [card("a")] }, { ...workflow, agents: { ...workflow.agents, enabled: false } }).blocked[0].reasons[0].code).toBe("agents-disabled")
  })
  it("identifies every SCC member across cross edges and keeps disjoint cycles separate", () => {
    const result = plan(
      card("a", { dependencies: ["b", "d"] }), card("b", { dependencies: ["c"] }),
      card("c", { dependencies: ["a"] }), card("d", { dependencies: ["c"] }),
      card("x", { dependencies: ["y"] }), card("y", { dependencies: ["x"] }),
      card("downstream", { dependencies: ["d"] }), card("independent"),
    )
    for (const ids of [["a", "b", "c", "d"], ["x", "y"]]) for (const id of ids)
      expect(result.blocked.find((item) => item.id === id)?.reasons.find((reason) => reason.code === "dependency-cycle")?.relatedIds).toEqual(ids)
    expect(result.blocked.find((item) => item.id === "downstream")?.reasons[0].code).toBe("blocked-prerequisite")
    expect(result.runnableNow).toEqual(["independent"])
    unique(result)
  })
  it("retains direct and inherited edges into completed targets without making completion block", () => {
    const result = plan(
      card("prerequisite"), card("parent", { type: "epic", dependencies: ["prerequisite"] }),
      card("archived", { parentId: "parent", archived: true, dependencies: ["direct"] }),
      card("direct"), card("done", { column: "finished", dependencies: ["prerequisite"] }),
      card("ready", { dependencies: ["archived", "done"] }),
    )
    expect(result.edges).toEqual(expect.arrayContaining([
      { from: "prerequisite", to: "archived" }, { from: "direct", to: "archived" },
      { from: "prerequisite", to: "done" }, { from: "archived", to: "ready" }, { from: "done", to: "ready" },
    ]))
    expect(result.completed).toEqual(["archived", "done"])
    expect(result.runnableNow).toEqual(["direct", "prerequisite", "ready"])
    const completedCycle = plan(card("a", { dependencies: ["b"], archived: true }), card("b", { dependencies: ["a"] }))
    expect(completedCycle.edges).toHaveLength(2)
    expect(completedCycle.runnableNow).toEqual(["b"])
    expect(completedCycle.blocked).toEqual([])
    unique(result)
  })
})
