import { ArchiveIcon, ClockIcon, MoreHorizontalIcon, Trash2Icon, UsersIcon } from "lucide-react"

import type { Recipe } from "@/api/recipes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { useSwipeReveal } from "@/hooks/use-swipe-reveal"
import { cn } from "@/lib/utils"

export type RecipeAction = "archive" | "delete"

export function RecipeRow({
  recipe,
  revealed,
  onRevealedChange,
  onAction,
}: {
  recipe: Recipe
  revealed: boolean
  onRevealedChange: (revealed: boolean) => void
  onAction: (action: RecipeAction) => void
}) {
  const { rowRef, rowProps, trayRef, offset, dragging, trayVisible } = useSwipeReveal({
    open: revealed,
    onOpenChange: onRevealedChange,
  })

  return (
    <li className="relative overflow-hidden rounded-lg" data-recipe-id={recipe.id}>
      <div
        ref={trayRef}
        className={cn(
          "absolute inset-y-0 right-0 flex items-center gap-2 px-3",
          !trayVisible && "invisible"
        )}
      >
        <Button variant="outline" onClick={() => onAction("archive")}>
          <ArchiveIcon data-icon="inline-start" />
          Archive
        </Button>
        <Button variant="destructive" onClick={() => onAction("delete")}>
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
      </div>
      <Item
        ref={rowRef}
        {...rowProps}
        variant="outline"
        className={cn(
          "relative flex-nowrap bg-card touch-pan-y select-none",
          !dragging && "transition-transform duration-200 ease-out"
        )}
        style={{ transform: `translateX(${offset}px)` }}
        onClick={() => {
          if (revealed) onRevealedChange(false)
        }}
      >
        <ItemContent className="min-w-0">
          <ItemTitle className="block w-full truncate">{recipe.title}</ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon aria-hidden="true" className="size-3.5" />
              <span>{recipe.minutes} min</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon aria-hidden="true" className="size-3.5" />
              <span>Serves {recipe.servings}</span>
            </span>
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Actions for ${recipe.title}`}
                  data-recipe-actions=""
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onAction("archive")}>
                  <ArchiveIcon />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onAction("delete")}>
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

export function RecipeRowSkeleton() {
  return (
    <li>
      <Item variant="outline" className="flex-nowrap">
        <ItemContent>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </ItemContent>
        <Skeleton className="size-8" />
      </Item>
    </li>
  )
}
