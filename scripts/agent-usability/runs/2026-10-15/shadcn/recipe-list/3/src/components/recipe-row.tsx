import { useRef, useState } from "react"
import { ArchiveIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { cn } from "cn"

import type { Recipe } from "@/api/recipes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type RecipeAction = "archive" | "delete"

/** Width of the swipe-revealed action tray, in px. */
const trayWidth = 160
/** How far a drag must move before it counts as a horizontal swipe. */
const lockDistance = 8

interface Gesture {
  source: "pointer" | "touch"
  pointerId?: number
  startX: number
  startY: number
  baseOffset: number
  axis: "x" | "y" | null
}

interface RecipeRowProps {
  recipe: Recipe
  revealed: boolean
  onRevealedChange: (revealed: boolean) => void
  onAction: (recipe: Recipe, action: RecipeAction) => void
}

export function RecipeRow({ recipe, revealed, onRevealedChange, onAction }: RecipeRowProps) {
  const gesture = useRef<Gesture | null>(null)
  const rowRef = useRef<HTMLLIElement>(null)
  // Offset while a finger is dragging the row; null when at rest.
  const [dragOffset, setDragOffset] = useState<number | null>(null)

  const restingOffset = revealed ? -trayWidth : 0
  const offset = dragOffset ?? restingOffset
  const trayVisible = revealed || offset < 0

  function start(source: Gesture["source"], x: number, y: number, pointerId?: number) {
    if (gesture.current) return
    gesture.current = { source, pointerId, startX: x, startY: y, baseOffset: restingOffset, axis: null }
  }

  function move(x: number, y: number) {
    const g = gesture.current
    if (!g) return
    const dx = x - g.startX
    const dy = y - g.startY
    if (g.axis === null) {
      if (Math.abs(dx) < lockDistance && Math.abs(dy) < lockDistance) return
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
      if (g.axis === "x" && g.source === "pointer" && g.pointerId !== undefined) {
        rowRef.current?.setPointerCapture?.(g.pointerId)
      }
    }
    if (g.axis !== "x") return
    setDragOffset(Math.min(0, Math.max(-trayWidth, g.baseOffset + dx)))
  }

  function end(x?: number, y?: number) {
    const g = gesture.current
    if (!g) return
    if (x !== undefined && y !== undefined) move(x, y)
    gesture.current = null
    if (g.axis === "x") {
      const dx = (x ?? g.startX) - g.startX
      const finalOffset = Math.min(0, Math.max(-trayWidth, g.baseOffset + dx))
      onRevealedChange(finalOffset < -trayWidth / 2)
    }
    setDragOffset(null)
  }

  function cancel() {
    gesture.current = null
    setDragOffset(null)
  }

  return (
    <li
      ref={rowRef}
      className="relative touch-pan-y overflow-hidden border-b last:border-b-0"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return
        start("pointer", e.clientX, e.clientY, e.pointerId)
      }}
      onPointerMove={(e) => {
        if (gesture.current?.source === "pointer" && gesture.current.pointerId === e.pointerId) {
          move(e.clientX, e.clientY)
        }
      }}
      onPointerUp={(e) => {
        if (gesture.current?.source === "pointer" && gesture.current.pointerId === e.pointerId) {
          end(e.clientX, e.clientY)
        }
      }}
      onPointerCancel={(e) => {
        if (gesture.current?.source === "pointer" && gesture.current.pointerId === e.pointerId) cancel()
      }}
      // Fallback for environments that only deliver touch events.
      onTouchStart={(e) => {
        const t = e.touches[0]
        if (t && e.touches.length === 1) start("touch", t.clientX, t.clientY)
      }}
      onTouchMove={(e) => {
        const t = e.touches[0]
        if (t && gesture.current?.source === "touch") move(t.clientX, t.clientY)
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0]
        if (gesture.current?.source === "touch") end(t?.clientX, t?.clientY)
      }}
      onTouchCancel={() => {
        if (gesture.current?.source === "touch") cancel()
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && revealed) onRevealedChange(false)
      }}
    >
      <div
        className={cn("absolute inset-y-0 right-0 flex", !trayVisible && "invisible")}
        style={{ width: trayWidth }}
      >
        <Button
          className="h-full flex-1 flex-col gap-1 rounded-none bg-neutral-700 text-white hover:bg-neutral-800 dark:bg-neutral-600 dark:hover:bg-neutral-500"
          onClick={() => onAction(recipe, "archive")}
        >
          <ArchiveIcon aria-hidden="true" />
          Archive
        </Button>
        <Button
          className="h-full flex-1 flex-col gap-1 rounded-none bg-red-700 text-white hover:bg-red-800"
          onClick={() => onAction(recipe, "delete")}
        >
          <Trash2Icon aria-hidden="true" />
          Delete
        </Button>
      </div>
      <div
        className={cn(
          "relative flex items-center gap-3 bg-card px-4 py-3 select-none",
          dragOffset === null && "transition-transform duration-200 ease-out",
        )}
        style={{ transform: `translateX(${offset}px)` }}
        onClick={() => {
          if (revealed) onRevealedChange(false)
        }}
      >
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium">{recipe.title}</h2>
          <p className="flex gap-3 text-sm text-muted-foreground">
            <span>{recipe.minutes} min</span>
            <span>Serves {recipe.servings}</span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label={`Actions for ${recipe.title}`}
                data-row-actions=""
              />
            }
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          {/* Full-screen backdrop: blocks the page while the menu is open, like a modal. */}
          <DropdownMenuPortal>
            <MenuPrimitive.Backdrop className="fixed inset-0 z-50" />
          </DropdownMenuPortal>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onAction(recipe, "archive")}>
              <ArchiveIcon aria-hidden="true" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(recipe, "delete")}>
              <Trash2Icon aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
