import * as React from "react"
import { ArchiveIcon, ClockIcon, MoreHorizontalIcon, Trash2Icon, UsersIcon } from "lucide-react"

import type { Recipe } from "@/api/recipes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type RecipeAction = "archive" | "delete"

/** Width of the swipe-revealed action tray, in px. */
const trayWidth = 176
/** How far a drag has to travel before it opens or closes the tray. */
const snapDistance = 56
/** Movement needed before we decide whether a gesture is a swipe or a scroll. */
const slop = 8

interface Gesture {
  startX: number
  startY: number
  base: number
  /** null until the gesture has moved far enough to tell its direction. */
  horizontal: boolean | null
}

interface RecipeRowProps {
  recipe: Recipe
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: (recipe: Recipe, action: RecipeAction) => void
  actionsButtonRef: (node: HTMLButtonElement | null) => void
}

export function RecipeRow({ recipe, open, onOpenChange, onAction, actionsButtonRef }: RecipeRowProps) {
  const [dragOffset, setDragOffset] = React.useState<number | null>(null)
  const gesture = React.useRef<Gesture | null>(null)
  const dragged = React.useRef(false)

  const restingOffset = open ? -trayWidth : 0
  const offset = dragOffset ?? restingOffset
  const trayVisible = offset < 0

  // Pointer and touch events both report a finger, so each handler is idempotent:
  // the first "start" wins, moves are computed from the start point, and the first "end" wins.
  function start(x: number, y: number) {
    if (gesture.current) return
    dragged.current = false
    gesture.current = { startX: x, startY: y, base: restingOffset, horizontal: null }
  }

  function move(x: number, y: number) {
    const g = gesture.current
    if (!g) return
    const dx = x - g.startX
    const dy = y - g.startY
    if (g.horizontal === null) {
      if (Math.abs(dx) < slop && Math.abs(dy) < slop) return
      g.horizontal = Math.abs(dx) > Math.abs(dy)
      if (!g.horizontal) {
        gesture.current = null
        return
      }
    }
    if (!g.horizontal) return
    dragged.current = true
    setDragOffset(Math.min(0, Math.max(-trayWidth - 48, g.base + dx)))
  }

  function end(x: number | null) {
    const g = gesture.current
    if (!g) return
    gesture.current = null
    setDragOffset(null)
    if (!g.horizontal || x === null) return
    const dx = x - g.startX
    if (!open && dx <= -snapDistance) onOpenChange(true)
    else if (open && dx >= snapDistance) onOpenChange(false)
  }

  function runAction(action: RecipeAction) {
    onOpenChange(false)
    onAction(recipe, action)
  }

  return (
    <li
      className="relative touch-pan-y overflow-hidden rounded-xl border bg-card text-card-foreground select-none"
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return
        start(event.clientX, event.clientY)
      }}
      onPointerMove={(event) => move(event.clientX, event.clientY)}
      onPointerUp={(event) => end(event.clientX)}
      onPointerCancel={() => end(null)}
      onTouchStart={(event) => {
        const touch = event.touches[0]
        if (touch) start(touch.clientX, touch.clientY)
      }}
      onTouchMove={(event) => {
        const touch = event.touches[0]
        if (touch) move(touch.clientX, touch.clientY)
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0]
        end(touch ? touch.clientX : null)
      }}
      onTouchCancel={() => end(null)}
      onClickCapture={(event) => {
        // A drag that ends over a button should not also press it.
        if (dragged.current) {
          dragged.current = false
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) onOpenChange(false)
      }}
    >
      <div
        className={trayVisible ? "absolute inset-y-0 right-0 flex" : "invisible absolute inset-y-0 right-0 flex"}
        style={{ width: trayWidth }}
      >
        <button
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-primary text-sm font-medium text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
          onClick={() => runAction("archive")}
        >
          <ArchiveIcon aria-hidden="true" className="size-4" />
          Archive
        </button>
        <button
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-red-700 text-sm font-medium text-white outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
          onClick={() => runAction("delete")}
        >
          <Trash2Icon aria-hidden="true" className="size-4" />
          Delete
        </button>
      </div>

      <div
        className="relative flex items-center gap-3 bg-card py-3 pr-2 pl-4"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragOffset === null ? "transform 200ms ease-out" : "none",
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate text-base font-medium">{recipe.title}</h2>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ClockIcon aria-hidden="true" className="size-3.5" />
              <span>{recipe.minutes} min</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <UsersIcon aria-hidden="true" className="size-3.5" />
              <span>Serves {recipe.servings}</span>
            </span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                ref={actionsButtonRef}
                variant="ghost"
                size="icon-lg"
                aria-label={`Actions for ${recipe.title}`}
              />
            }
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-36">
            <DropdownMenuItem onClick={() => runAction("archive")}>
              <ArchiveIcon aria-hidden="true" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runAction("delete")}>
              <Trash2Icon aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
