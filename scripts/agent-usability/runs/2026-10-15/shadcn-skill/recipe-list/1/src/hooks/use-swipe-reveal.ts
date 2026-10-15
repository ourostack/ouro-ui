import * as React from "react"

/** How far a pointer moves before we decide between a sideways swipe and a scroll. */
const slop = 8
/** A quick flick opens the tray even if it did not travel past the halfway point. */
const flickMs = 250
const flickDistance = 40

type Gesture = { source: "pointer" | "touch"; stop: () => void }

/**
 * Lets a row be dragged left to reveal a tray of actions behind it, and dragged right to hide
 * it again. Releasing the drag only opens or closes the tray; it never runs an action.
 *
 * The row needs `touch-action: pan-y` so the browser leaves sideways drags to us and still
 * scrolls the page vertically.
 */
export function useSwipeReveal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const rowRef = React.useRef<HTMLDivElement>(null)
  const trayRef = React.useRef<HTMLDivElement>(null)
  const gesture = React.useRef<Gesture | null>(null)
  const suppressClick = React.useRef(false)
  const [dragOffset, setDragOffset] = React.useState<number | null>(null)
  const [trayWidth, setTrayWidth] = React.useState(0)

  React.useEffect(() => () => gesture.current?.stop(), [])

  function begin(
    source: Gesture["source"],
    startX: number,
    startY: number,
    pointerId?: number
  ) {
    const row = rowRef.current
    const tray = trayRef.current
    // A finger fires both pointer and touch events; the first one to arrive owns the gesture.
    if (!row || !tray || gesture.current) return

    const width = row.offsetWidth
    const reveal = tray.offsetWidth
    const startOffset = open ? -reveal : 0
    const startTime = performance.now()
    let mode: "pending" | "drag" | "scroll" = "pending"
    let offset = startOffset

    const move = (x: number, y: number) => {
      const dx = x - startX
      const dy = y - startY
      if (mode === "pending") {
        if (Math.abs(dx) < slop && Math.abs(dy) < slop) return
        mode = Math.abs(dx) > Math.abs(dy) ? "drag" : "scroll"
        if (mode === "drag" && pointerId !== undefined) {
          try {
            row.setPointerCapture(pointerId)
          } catch {
            // Synthetic pointers can't be captured; the window listeners still see them.
          }
        }
      }
      if (mode !== "drag") return
      offset = Math.min(0, Math.max(-width * 0.9, startOffset + dx))
      setDragOffset(offset)
    }

    const end = (cancelled: boolean) => {
      stop()
      if (mode !== "drag") return
      suppressClick.current = true
      window.setTimeout(() => {
        suppressClick.current = false
      }, 400)
      setDragOffset(null)
      if (cancelled) return

      const dx = offset - startOffset
      const flick =
        performance.now() - startTime < flickMs && Math.abs(dx) > flickDistance
      const shouldOpen = flick ? dx < 0 : offset < -reveal / 2
      setTrayWidth(reveal)
      if (shouldOpen !== open) onOpenChange(shouldOpen)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId === pointerId) move(event.clientX, event.clientY)
    }
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId === pointerId) end(false)
    }
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId) end(true)
    }
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (touch) move(touch.clientX, touch.clientY)
    }
    const onTouchEnd = () => end(false)
    const onTouchCancel = () => end(true)

    function stop() {
      if (source === "pointer") {
        window.removeEventListener("pointermove", onPointerMove)
        window.removeEventListener("pointerup", onPointerUp)
        window.removeEventListener("pointercancel", onPointerCancel)
      } else {
        window.removeEventListener("touchmove", onTouchMove)
        window.removeEventListener("touchend", onTouchEnd)
        window.removeEventListener("touchcancel", onTouchCancel)
      }
      gesture.current = null
    }

    if (source === "pointer") {
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", onPointerUp)
      window.addEventListener("pointercancel", onPointerCancel)
    } else {
      window.addEventListener("touchmove", onTouchMove, { passive: true })
      window.addEventListener("touchend", onTouchEnd)
      window.addEventListener("touchcancel", onTouchCancel)
    }
    gesture.current = { source, stop }
  }

  const rowProps = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return
      begin("pointer", event.clientX, event.clientY, event.pointerId)
    },
    onTouchStart: (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0]
      if (touch) begin("touch", touch.clientX, touch.clientY)
    },
    onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => {
      // The click that ends a drag shouldn't press whatever was under the finger.
      if (suppressClick.current) {
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }
    },
  }

  const offset = dragOffset ?? (open ? -trayWidth : 0)

  return {
    rowRef,
    rowProps,
    trayRef,
    offset,
    dragging: dragOffset !== null,
    trayVisible: open || offset < 0,
  }
}
