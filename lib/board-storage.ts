import { EMPTY_BOARD, parseBoard, updateBoard, type BoardAction, type BoardData } from "./board"

export const BOARD_STORAGE_KEY = "agora.board.v1"
export interface BoardStorage {
  read(): string | null
  write(value: string): void
  subscribe(listener: () => void): () => void
}
export function browserStorage(storage: Storage, events: Window): BoardStorage {
  return {
    read: () => storage.getItem(BOARD_STORAGE_KEY),
    write: (value) => storage.setItem(BOARD_STORAGE_KEY, value),
    subscribe(listener) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === BOARD_STORAGE_KEY || event.key === null) listener()
      }
      events.addEventListener("storage", onStorage)
      return () => events.removeEventListener("storage", onStorage)
    },
  }
}
export type BoardSnapshot = {
  board: BoardData
  ready: boolean
  error: string | null
  readOnly: boolean
  unsaved: boolean
}
const INITIAL: BoardSnapshot = {
  board: EMPTY_BOARD,
  ready: false,
  error: null,
  readOnly: false,
  unsaved: false,
}
export class BoardStore {
  private snapshot = INITIAL
  private listeners = new Set<() => void>()
  private rawBackup: string | null = null
  constructor(private storage: BoardStorage) {}
  getSnapshot = () => this.snapshot
  getServerSnapshot = () => INITIAL
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(snapshot: BoardSnapshot) {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }
  connect = () => {
    this.load()
    return this.storage.subscribe(() => {
      // Never replace unsaved changes with an older persisted snapshot.
      if (!this.snapshot.unsaved) this.load()
    })
  }
  private load() {
    let raw: string | null = null
    try {
      raw = this.storage.read()
      const board = raw === null ? EMPTY_BOARD : parseBoard(raw)
      this.rawBackup = null
      this.publish({ board, ready: true, error: null, readOnly: false, unsaved: false })
    } catch {
      this.rawBackup = raw
      this.publish({
        ...this.snapshot,
        ready: true,
        readOnly: raw !== null,
        error:
          raw !== null
            ? "Saved data could not be read. It has been left untouched. Download a backup before starting a new board."
            : "Browser storage is unavailable. Changes stay in this tab; export a backup before closing it.",
        unsaved: raw === null,
      })
    }
  }
  dispatch = (action: BoardAction) => {
    if (this.snapshot.readOnly)
      throw new Error("Download the saved data before starting a new board.")
    let board = this.snapshot.board
    let readFailed = false
    if (!this.snapshot.unsaved) {
      // Read the latest write before applying a mutation, so another tab's cards survive.
      let latest: string | null = null
      try {
        latest = this.storage.read()
      } catch {
        readFailed = true
      }
      if (!readFailed && latest === null) board = EMPTY_BOARD
      if (latest !== null) {
        try {
          board = parseBoard(latest)
        } catch {
          this.rawBackup = latest
          this.publish({
            ...this.snapshot,
            readOnly: true,
            error:
              "Saved data could not be read. It has been left untouched. Download a backup before starting a new board.",
          })
          throw new Error(
            "Saved data could not be read. Your edit was not applied and the saved data is untouched.",
          )
        }
      }
    }
    const next = updateBoard(board, action)
    try {
      if (readFailed) throw new Error("Cannot safely write unreadable storage")
      this.storage.write(JSON.stringify(next))
      this.publish({ board: next, ready: true, error: null, readOnly: false, unsaved: false })
    } catch {
      this.publish({
        board: next,
        ready: true,
        error:
          "Changes are only saved in this tab. Browser storage is full or unavailable; export a backup before closing it.",
        readOnly: false,
        unsaved: true,
      })
    }
  }
  export = () => this.rawBackup ?? JSON.stringify(this.snapshot.board, null, 2)
  replace = (raw: string) => {
    const next = parseBoard(raw)
    // Unlike regular edits, destructive replacement requires a successful write first.
    this.storage.write(JSON.stringify(next))
    this.rawBackup = null
    this.publish({ board: next, ready: true, error: null, readOnly: false, unsaved: false })
  }
}
