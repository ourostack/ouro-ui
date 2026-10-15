import * as React from "react"
import { cn } from "cn"

/** How far the row slides to show its swipe actions, in px. */
const actionsWidth = 176

type Gesture = {
  source: "pointer" | "touch"
  id: number
  startX: number
  startY: number
  startOffset: number
  /** null until the gesture is known to be horizontal or vertical. */
  axis: "x" | "y" | null
}

/**
 * A list row that slides left under a finger to reveal `actions`. The drag only reveals the
 * actions; it never runs one. `touch-action: pan-y` keeps the browser from scrolling sideways.
 */
export function SwipeRow({
  actions,
  children,
  className,
}: {
  actions: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const [revealed, setRevealed] = React.useState(false)
  const [dragOffset, setDragOffset] = React.useState<number | null>(null)
  const gesture = React.useRef<Gesture | null>(null)
  const suppressClick = React.useRef(false)
  const rowRef = React.useRef<HTMLDivElement>(null)

  const restingOffset = revealed ? -actionsWidth : 0
  const offset = dragOffset ?? restingOffset

  function start(source: Gesture["source"], id: number, x: number, y: number) {
    if (gesture.current) return
    gesture.current = { source, id, startX: x, startY: y, startOffset: restingOffset, axis: null }
  }

  function move(source: Gesture["source"], id: number, x: number, y: number) {
    const g = gesture.current
    if (!g || g.source !== source || g.id !== id) return
    const dx = x - g.startX
    const dy = y - g.startY
    if (g.axis === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
    }
    if (g.axis !== "x") return
    const width = rowRef.current?.offsetWidth ?? 400
    setDragOffset(Math.min(0, Math.max(-width, g.startOffset + dx)))
  }

  function end(source: Gesture["source"], id: number, x: number) {
    const g = gesture.current
    if (!g || g.source !== source || g.id !== id) return
    gesture.current = null
    setDragOffset(null)
    if (g.axis !== "x") return
    suppressClick.current = true
    const dx = x - g.startX
    const width = rowRef.current?.offsetWidth ?? 400
    const threshold = Math.min(actionsWidth / 2, width / 4)
    if (dx <= -threshold) setRevealed(true)
    else if (dx >= threshold) setRevealed(false)
  }

  function cancel() {
    gesture.current = null
    setDragOffset(null)
  }

  const dragging = dragOffset !== null
  const actionsVisible = revealed || offset < 0

  return (
    <div
      ref={rowRef}
      className={cn("relative touch-pan-y overflow-hidden select-none", className)}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return
        if ((e.target as HTMLElement).closest("button")) return
        start("pointer", e.pointerId, e.clientX, e.clientY)
      }}
      onPointerMove={(e) => move("pointer", e.pointerId, e.clientX, e.clientY)}
      onPointerUp={(e) => end("pointer", e.pointerId, e.clientX)}
      onPointerCancel={cancel}
      onTouchStart={(e) => {
        const t = e.changedTouches[0]
        if ((e.target as HTMLElement).closest("button")) return
        start("touch", t.identifier, t.clientX, t.clientY)
      }}
      onTouchMove={(e) => {
        for (const t of Array.from(e.changedTouches)) move("touch", t.identifier, t.clientX, t.clientY)
      }}
      onTouchEnd={(e) => {
        for (const t of Array.from(e.changedTouches)) end("touch", t.identifier, t.clientX)
      }}
      onTouchCancel={cancel}
      onPointerDownCapture={() => {
        suppressClick.current = false
      }}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false
          e.stopPropagation()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && revealed) setRevealed(false)
      }}
    >
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex items-stretch",
          !actionsVisible && "invisible"
        )}
        style={{ width: actionsWidth }}
      >
        {actions}
      </div>
      <div
        className={cn(
          "relative bg-background",
          !dragging && "transition-transform duration-200 ease-out"
        )}
        style={{ transform: `translateX(${offset}px)` }}
        onClick={(e) => {
          if (revealed && !(e.target as HTMLElement).closest("button")) setRevealed(false)
        }}
      >
        {children}
      </div>
    </div>
  )
}
