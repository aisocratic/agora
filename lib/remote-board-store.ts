import { workflowSchema } from "./workflow"
import { EMPTY_BOARD, parseBoard, type BoardAction } from "./board"
import type { BoardController, BoardSnapshot } from "./board-storage"

const INITIAL: BoardSnapshot = { board: EMPTY_BOARD, ready: false, error: null, readOnly: false, unsaved: false, pending: false }
export class RemoteBoardStore implements BoardController {
  private snapshot = INITIAL
  private etag: string | null = null
  private listeners = new Set<() => void>()
  constructor(private request: typeof fetch = (...args) => fetch(...args), private interval = 1500) {}
  getSnapshot = () => this.snapshot
  getServerSnapshot = () => INITIAL
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(next: Partial<BoardSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next }
    this.listeners.forEach((listener) => listener())
  }
  private async accept(response: Response) {
    const value = await response.json()
    if (!response.ok) throw new Error(value.error ?? "Could not reach the shared board.")
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("Invalid server revision.")
    // A poll started before a mutation must never roll the board back.
    if (value.revision < (this.snapshot.revision ?? -1)) return
    const board = parseBoard(JSON.stringify(value.board))
    this.etag = response.headers.get("etag")
    this.publish({ board, revision: value.revision, ready: true, error: null, ...(value.workflow ? { workflow: workflowSchema.parse(value.workflow) } : {}) })
    return value
  }
  refresh = async () => {
    if (this.snapshot.pending) return
    try {
      const headers: Record<string, string> = {}
      if (this.etag) headers["If-None-Match"] = this.etag
      const response = await this.request("/api/board", { headers, cache: "no-store" })
      if (response.status === 304) { this.publish({ error: null }); return }
      await this.accept(response)
    } catch (error) {
      this.publish({ error: error instanceof Error ? error.message : "The shared board is unavailable." })
    }
  }
  connect = () => {
    void this.refresh()
    const timer = setInterval(() => { void this.refresh() }, this.interval)
    return () => clearInterval(timer)
  }
  private async mutate(method: string, input: object, revision = this.snapshot.revision, path = "/api/board") {
    if (this.snapshot.pending) throw new Error("Wait for the current change to finish.")
    if (revision === undefined) throw new Error("Wait for the shared board to load.")
    this.publish({ pending: true, error: null })
    try {
      const response = await this.request(path, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, revision }),
      })
      return await this.accept(response)
    } catch (error) {
      this.publish({ pending: false })
      await this.refresh()
      const message = error instanceof Error ? error.message : "Could not save this change. Your draft has been kept."
      this.publish({ error: message })
      throw new Error(message)
    } finally { this.publish({ pending: false }) }
  }
  dispatch = async (action: BoardAction, revision?: number) => {
    if (action.type === "comment") await this.mutate("POST", { body: action.comment.body }, revision, `/api/cards/${encodeURIComponent(action.id)}/comments`)
    else await this.mutate("POST", { action }, revision)
  }
  launch = async (id: string, idempotencyKey: string, revision?: number) => {
    const result = await this.mutate("POST", { idempotencyKey }, revision, `/api/cards/${encodeURIComponent(id)}/dispatch`)
    return result.dispatch as { id: string; status: string; message: string }
  }
  export = () => JSON.stringify(this.snapshot.board, null, 2)
  replace = async (raw: string) => { await this.mutate("PUT", { board: parseBoard(raw) }) }
}
