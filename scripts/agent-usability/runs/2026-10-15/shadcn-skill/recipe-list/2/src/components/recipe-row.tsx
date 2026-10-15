import * as React from "react"
import { cn } from "cn"
import { ArchiveIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react"

import type { Recipe } from "@/api/recipes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"

export type RecipeAction = "archive" | "delete"

type DragSource = "pointer" | "touch"

interface DragState {
  source: DragSource
  id: number
  startX: number
  startY: number
  base: number
  offset: number
  active: boolean
}

/** Movement, in px, before a press is treated as a swipe or a scroll. */
const SLOP = 8

export function RecipeRow({
  recipe,
  onAction,
}: {
  recipe: Recipe
  onAction: (recipe: Recipe, action: RecipeAction) => void
}) {
  const rowRef = React.useRef<HTMLLIElement>(null)
  const actionsRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<DragState | null>(null)
  // Offset while a finger or pointer is dragging the row, null otherwise.
  const [dragOffset, setDragOffset] = React.useState<number | null>(null)
  // Width of the revealed actions, 0 while they are hidden.
  const [revealed, setRevealed] = React.useState(0)
  const [menuOpen, setMenuOpen] = React.useState(false)

  const offset = dragOffset ?? -revealed
  const showActions = offset < 0

  function begin(source: DragSource, id: number, x: number, y: number) {
    if (drag.current) return
    drag.current = { source, id, startX: x, startY: y, base: -revealed, offset: -revealed, active: false }
  }

  function move(source: DragSource, id: number, x: number, y: number) {
    const state = drag.current
    if (!state || state.source !== source || state.id !== id) return false
    const dx = x - state.startX
    const dy = y - state.startY
    if (!state.active) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return false
      if (Math.abs(dy) > Math.abs(dx)) {
        // A vertical drag is a scroll: let the browser have it.
        drag.current = null
        return false
      }
      state.active = true
      // A press on the actions button that turns into a swipe shouldn't leave its menu open.
      setMenuOpen(false)
    }
    const width = rowRef.current?.offsetWidth ?? 0
    state.offset = Math.min(0, Math.max(-width, state.base + dx))
    setDragOffset(state.offset)
    return true
  }

  function end(source: DragSource, id: number) {
    const state = drag.current
    if (!state || state.source !== source || state.id !== id) return
    drag.current = null
    if (!state.active) return
    const actionsWidth = actionsRef.current?.offsetWidth ?? 0
    setRevealed(state.offset < -actionsWidth / 2 ? actionsWidth : 0)
    setDragOffset(null)
  }

  function cancel(source: DragSource, id: number) {
    const state = drag.current
    if (!state || state.source !== source || state.id !== id) return
    drag.current = null
    setDragOffset(null)
  }

  function run(action: RecipeAction) {
    setRevealed(0)
    onAction(recipe, action)
  }

  const title = recipe.title

  return (
    <li
      ref={rowRef}
      className="relative touch-pan-y overflow-hidden rounded-lg border bg-card"
      onKeyDown={(event) => {
        if (event.key === "Escape" && revealed) setRevealed(0)
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return
        begin("pointer", event.pointerId, event.clientX, event.clientY)
      }}
      onPointerMove={(event) => {
        const wasActive = drag.current?.active
        if (move("pointer", event.pointerId, event.clientX, event.clientY) && !wasActive) {
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            // Synthetic pointers can't be captured; the drag still works.
          }
        }
      }}
      onPointerUp={(event) => end("pointer", event.pointerId)}
      onPointerCancel={(event) => cancel("pointer", event.pointerId)}
      onTouchStart={(event) => {
        const touch = event.changedTouches[0]
        if (touch) begin("touch", touch.identifier, touch.clientX, touch.clientY)
      }}
      onTouchMove={(event) => {
        for (const touch of Array.from(event.changedTouches)) {
          move("touch", touch.identifier, touch.clientX, touch.clientY)
        }
      }}
      onTouchEnd={(event) => {
        for (const touch of Array.from(event.changedTouches)) end("touch", touch.identifier)
      }}
      onTouchCancel={(event) => {
        for (const touch of Array.from(event.changedTouches)) cancel("touch", touch.identifier)
      }}
    >
      <div
        ref={actionsRef}
        className={cn(
          "absolute inset-y-0 right-0 flex items-center gap-2 px-3",
          !showActions && "invisible"
        )}
      >
        <Button variant="secondary" onClick={() => run("archive")}>
          <ArchiveIcon data-icon="inline-start" />
          Archive
        </Button>
        <Button variant="destructive" onClick={() => run("delete")}>
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
      </div>
      <Item
        className={cn(
          "relative rounded-none bg-card select-none",
          dragOffset === null && "transition-transform duration-200 motion-reduce:transition-none"
        )}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      >
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full truncate">{title}</ItemTitle>
          <ItemDescription className="flex flex-wrap gap-x-3">
            <span>{recipe.minutes} min</span>
            <span>Serves {recipe.servings}</span>
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <DropdownMenu
            open={menuOpen}
            onOpenChange={(open) => setMenuOpen(open && !drag.current?.active)}
          >
            <DropdownMenuTrigger
              data-recipe-actions=""
              render={<Button variant="ghost" size="icon" aria-label={`Actions for ${title}`} />}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            {/* Opens without fading in, so its text never shows at partial contrast. */}
            <DropdownMenuContent align="end" className="data-open:animate-none">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => run("archive")}>
                  <ArchiveIcon />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => run("delete")}>
                  <Trash2Icon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </Item>
    </li>
  )
}
