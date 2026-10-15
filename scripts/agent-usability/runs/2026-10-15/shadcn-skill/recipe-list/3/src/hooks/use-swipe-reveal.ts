import * as React from "react"

// How far a finger has to move before we decide whether the gesture is a
// sideways swipe or a vertical scroll.
const AXIS_LOCK_DISTANCE = 8

type Gesture = {
  source: "pointer" | "touch"
  pointerId: number
  startX: number
  startY: number
  startOffset: number
  width: number
  axis: "x" | "y" | null
}

// Lets a row be dragged to the left to reveal actions that sit behind it, the
// way mail apps do. The drag only reveals the actions: it never runs them.
//
// Pointer events cover mouse, pen and touch. Touch events are a fallback for
// browsers (and synthetic gestures) that send touch events without pointer
// events. Pair it with `touch-action: pan-y` on the row so the browser leaves
// sideways drags to us and still scrolls the page vertically.
export function useSwipeReveal() {
  const actionsRef = React.useRef<HTMLDivElement>(null)
  const gesture = React.useRef<Gesture | null>(null)
  const didDrag = React.useRef(false)
  // Where the row rests: 0 when closed, minus the actions' width when open.
  const [restOffset, setRestOffset] = React.useState(0)
  const [dragOffset, setDragOffset] = React.useState<number | null>(null)

  const actionsWidth = () => actionsRef.current?.offsetWidth ?? 160

  const open = restOffset < 0
  const offset = dragOffset ?? restOffset

  function start(
    source: Gesture["source"],
    pointerId: number,
    x: number,
    y: number,
    row: HTMLElement
  ) {
    didDrag.current = false
    gesture.current = {
      source,
      pointerId,
      startX: x,
      startY: y,
      startOffset: restOffset,
      width: row.offsetWidth,
      axis: null,
    }
  }

  // Returns true once the gesture is a sideways drag.
  function move(x: number, y: number) {
    const g = gesture.current
    if (!g) return false
    const dx = x - g.startX
    const dy = y - g.startY

    if (g.axis === null) {
      if (Math.abs(dx) < AXIS_LOCK_DISTANCE && Math.abs(dy) < AXIS_LOCK_DISTANCE) {
        return false
      }
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
    }
    if (g.axis !== "x") return false

    didDrag.current = true
    setDragOffset(Math.min(0, Math.max(-g.width, g.startOffset + dx)))
    return true
  }

  function end(x: number) {
    const g = gesture.current
    gesture.current = null
    if (!g || g.axis !== "x") return
    const final = Math.min(0, g.startOffset + (x - g.startX))
    const width = actionsWidth()
    setRestOffset(final < -width / 2 ? -width : 0)
    setDragOffset(null)
  }

  function cancel() {
    gesture.current = null
    setDragOffset(null)
  }

  const rowProps = {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (!event.currentTarget.contains(event.target as Node)) return
      if (event.pointerType === "mouse") {
        // Leave clicks on the row's buttons alone.
        if (event.button !== 0) return
        if ((event.target as Element).closest("button")) return
      }
      start("pointer", event.pointerId, event.clientX, event.clientY, event.currentTarget)
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const g = gesture.current
      if (g?.source !== "pointer" || g.pointerId !== event.pointerId) return
      const wasDragging = g.axis === "x"
      if (move(event.clientX, event.clientY) && !wasDragging) {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      const g = gesture.current
      if (g?.source !== "pointer" || g.pointerId !== event.pointerId) return
      end(event.clientX)
    },
    onPointerCancel(event: React.PointerEvent<HTMLElement>) {
      const g = gesture.current
      if (g?.source !== "pointer" || g.pointerId !== event.pointerId) return
      cancel()
    },
    onTouchStart(event: React.TouchEvent<HTMLElement>) {
      // A gesture the pointer events already track.
      if (gesture.current?.source === "pointer") return
      if (!event.currentTarget.contains(event.target as Node)) return
      const touch = event.touches[0]
      if (!touch || event.touches.length > 1) return
      start("touch", touch.identifier, touch.clientX, touch.clientY, event.currentTarget)
    },
    onTouchMove(event: React.TouchEvent<HTMLElement>) {
      const g = gesture.current
      if (g?.source !== "touch") return
      const touch = Array.from(event.touches).find((t) => t.identifier === g.pointerId)
      if (touch) move(touch.clientX, touch.clientY)
    },
    onTouchEnd(event: React.TouchEvent<HTMLElement>) {
      const g = gesture.current
      if (g?.source !== "touch") return
      const touch = Array.from(event.changedTouches).find((t) => t.identifier === g.pointerId)
      if (touch) end(touch.clientX)
    },
    onTouchCancel() {
      if (gesture.current?.source === "touch") cancel()
    },
    // A drag that ends over a button must not also press it.
    onClickCapture(event: React.MouseEvent<HTMLElement>) {
      if (!didDrag.current) return
      didDrag.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  }

  return {
    actionsRef,
    rowProps,
    offset,
    dragging: dragOffset !== null,
    revealed: offset < 0,
    open,
    close: () => setRestOffset(0),
  }
}
