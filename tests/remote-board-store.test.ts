import { describe, expect, it, vi } from "vitest"
import { RemoteBoardStore } from "../lib/remote-board-store"

const board = (title = "Original") => ({ version: 1, cards: [{
  id: "a", title, description: "", column: "todo", archived: false,
  createdAt: "2026-09-05T00:00:00Z", updatedAt: "2026-09-05T00:00:00Z",
}] })
describe("asynchronous shared storage", () => {
  it("does not let an older poll overwrite a completed mutation", async () => {
    let resolvePoll!: (response: Response) => void
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ board: board(), revision: 1 }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolvePoll = resolve }))
      .mockResolvedValueOnce(Response.json({ board: board("Updated"), revision: 2 }))
    const store = new RemoteBoardStore(request)
    await store.refresh()
    const poll = store.refresh()
    await store.dispatch({ type: "edit", id: "a", draft: { title: "Updated", description: "", column: "todo" } })
    resolvePoll(Response.json({ board: board(), revision: 1 }))
    await poll
    expect(store.getSnapshot().board.cards[0].title).toBe("Updated")
    expect(store.getSnapshot().revision).toBe(2)
  })
  it("sends the editor's original revision, rejects conflicts and refreshes for an explicit retry", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ board: board(), revision: 4 }))
      .mockResolvedValueOnce(Response.json({ error: "Conflict: draft kept" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ board: board("Someone else's change"), revision: 5 }))
    const store = new RemoteBoardStore(request)
    await store.refresh()
    await expect(store.dispatch({ type: "archive", id: "a" }, 3)).rejects.toThrow("draft kept")
    expect(JSON.parse(request.mock.calls[1][1]!.body as string).revision).toBe(3)
    expect(store.getSnapshot()).toMatchObject({ revision: 5, pending: false, error: "Conflict: draft kept" })
  })
  it("exposes pending state and rejects overlapping writes", async () => {
    let complete!: (response: Response) => void
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ board: board(), revision: 1 }))
      .mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    const store = new RemoteBoardStore(request)
    await store.refresh()
    const save = store.dispatch({ type: "archive", id: "a" })
    expect(store.getSnapshot().pending).toBe(true)
    await expect(store.dispatch({ type: "archive", id: "a" })).rejects.toThrow("Wait")
    complete(Response.json({ board: board(), revision: 2 }))
    await save
    expect(store.getSnapshot().pending).toBe(false)
  })
})
