"use client"

/* Rubber-band selection: press on empty space in the board's columns and drag
   a rectangle over cards to select them, as a modifier-click on each one would.
   A plain click on empty space clears the selection. Shift, Cmd or Ctrl add the
   rectangle's cards to what is already selected.

   Cards own their own presses (dnd-kit drags them), so a press that starts on a
   card, a control or an open menu is never a marquee.

   Dragging near the top or bottom edge scrolls whatever holds the board,
   faster the closer the pointer gets; the rectangle keeps its start on the page
   and grows over the cards that scroll into view.

   Ported from the AI Socratic website's board (use-marquee-select.tsx). */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

/* Travel before a press becomes a marquee (below it, it is a click). */
const START_DISTANCE = 4
/* How close to the top or bottom edge the pointer must be to scroll, and the fastest scroll (px per frame). */
const EDGE = 64
const MAX_SPEED = 24
/* Where a marquee may not start: cards, controls, and anything floating above the board. */
const NOT_EMPTY_SPACE =
  ".agora-card,[data-no-marquee],button,a,input,textarea,select,label,[role='button'],[role='dialog'],[role='menu'],[role='listbox'],[contenteditable='true']"

type Box = { left: number; top: number; width: number; height: number }

const boxOf = (ax: number, ay: number, bx: number, by: number): Box => ({
  left: Math.min(ax, bx),
  top: Math.min(ay, by),
  width: Math.abs(ax - bx),
  height: Math.abs(ay - by),
})

/* Whether two boxes overlap at all. */
export const boxesOverlap = (a: Box, b: Box) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height

/* What scrolls the board vertically: its nearest scrolling ancestor, else the page. */
function scrollerOf(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) return node
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/* The part of the screen the scroller shows: the window for the page itself. */
function viewportOf(scroller: HTMLElement): { top: number; bottom: number } {
  if (scroller === document.scrollingElement || scroller === document.documentElement) return { top: 0, bottom: window.innerHeight }
  const rect = scroller.getBoundingClientRect()
  return { top: Math.max(0, rect.top), bottom: Math.min(window.innerHeight, rect.bottom) }
}

/* How far to scroll this frame: negative near the top edge, positive near the bottom, 0 between. */
export function edgeScrollSpeed(y: number, top: number, bottom: number): number {
  if (y < top + EDGE) return -Math.ceil(MAX_SPEED * Math.min(1, (top + EDGE - y) / EDGE))
  if (y > bottom - EDGE) return Math.ceil(MAX_SPEED * Math.min(1, (y - (bottom - EDGE)) / EDGE))
  return 0
}

/* IDs of the cards in `area` that the box touches. */
function cardsUnder(area: HTMLElement, box: Box): string[] {
  const ids: string[] = []
  for (const element of area.querySelectorAll<HTMLElement>(".agora-card[data-card-id]")) {
    if (boxesOverlap(box, element.getBoundingClientRect())) ids.push(element.dataset.cardId!)
  }
  return ids
}

export function useMarqueeSelect({ getSelectedIds, setSelectedIds, disabled = false }: {
  getSelectedIds: () => Set<string>
  setSelectedIds: (next: Set<string>) => void
  /* True while a card is being dragged or the editor is open. */
  disabled?: boolean
}) {
  const [box, setBox] = useState<Box | null>(null)
  // The start is kept in the scroller's coordinates (y + its scrollTop then), so it stays put on the page as it scrolls.
  const session = useRef<{
    x: number; y: number; area: HTMLElement; scroller: HTMLElement; startScroll: number
    pointer: { x: number; y: number }; base: Set<string>; active: boolean; box: Box | null
  } | null>(null)
  const frame = useRef(0)
  const scrollFrame = useRef(0)
  const latest = useRef({ getSelectedIds, setSelectedIds })
  useEffect(() => { latest.current = { getSelectedIds, setSelectedIds } })

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current)
    cancelAnimationFrame(scrollFrame.current)
    session.current = null
    setBox(null)
    document.body.style.removeProperty("user-select")
  }, [])
  useEffect(() => stop, [stop])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (disabled || event.button !== 0 || event.pointerType === "touch") return
    const target = event.target as HTMLElement
    // A press in a dialog or menu reaches here through React's tree, not the DOM's: only the board's own space counts.
    if (!event.currentTarget.contains(target) || target.closest(NOT_EMPTY_SPACE)) return
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    const area = event.currentTarget
    const scroller = scrollerOf(area)
    session.current = {
      x: event.clientX, y: event.clientY, area, scroller, startScroll: scroller.scrollTop,
      pointer: { x: event.clientX, y: event.clientY },
      base: additive ? new Set(latest.current.getSelectedIds()) : new Set<string>(),
      active: false, box: null,
    }

    // The box from where the drag started (moved by however far the page has scrolled since) to the pointer.
    const update = () => {
      const current = session.current
      if (!current?.active) return
      const startY = current.y - (current.scroller.scrollTop - current.startScroll)
      const next = boxOf(current.x, startY, current.pointer.x, current.pointer.y)
      current.box = next
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        setBox(next)
        latest.current.setSelectedIds(new Set([...current.base, ...cardsUnder(current.area, next)]))
      })
    }
    // While the pointer sits near an edge, scroll a little every frame and grow the box with it.
    const autoScroll = () => {
      const current = session.current
      if (!current?.active) return
      const { top, bottom } = viewportOf(current.scroller)
      const speed = edgeScrollSpeed(current.pointer.y, top, bottom)
      if (speed) {
        const before = current.scroller.scrollTop
        current.scroller.scrollTop = before + speed
        if (current.scroller.scrollTop !== before) update()
      }
      scrollFrame.current = requestAnimationFrame(autoScroll)
    }

    const onMove = (move: PointerEvent) => {
      const current = session.current
      if (!current) return
      current.pointer = { x: move.clientX, y: move.clientY }
      if (!current.active) {
        if (Math.hypot(move.clientX - current.x, move.clientY - current.y) < START_DISTANCE) return
        current.active = true
        // The drag would otherwise select the page's text as it sweeps over it.
        document.body.style.setProperty("user-select", "none")
        window.getSelection()?.removeAllRanges()
        scrollFrame.current = requestAnimationFrame(autoScroll)
      }
      update()
    }
    // A wheel scroll mid-drag moves the page under the box too.
    const onScroll = () => update()
    const scrollTarget: HTMLElement | Window = scroller === document.scrollingElement ? window : scroller
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      scrollTarget.removeEventListener("scroll", onScroll)
      const current = session.current
      // A press that never became a drag is a click on empty space: let go of the selection.
      if (current && !current.active && !additive && latest.current.getSelectedIds().size) latest.current.setSelectedIds(new Set())
      // The last frame may not have painted yet: settle the selection on where the drag ended.
      if (current?.active && current.box) latest.current.setSelectedIds(new Set([...current.base, ...cardsUnder(current.area, current.box)]))
      stop()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    scrollTarget.addEventListener("scroll", onScroll, { passive: true })
  }

  const marquee = box ? <div aria-hidden="true" className="agora-marquee" style={box} /> : null
  return { onPointerDown, marquee, selecting: box !== null }
}
