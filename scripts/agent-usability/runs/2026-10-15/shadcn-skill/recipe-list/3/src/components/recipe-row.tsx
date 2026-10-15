import { ArchiveIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

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
import { useSwipeReveal } from "@/hooks/use-swipe-reveal"

export type RecipeAction = "archive" | "delete"

export function RecipeRow({
  recipe,
  onAction,
}: {
  recipe: Recipe
  onAction: (recipe: Recipe, action: RecipeAction) => void
}) {
  const { actionsRef, rowProps, offset, dragging, revealed, open, close } =
    useSwipeReveal()

  return (
    <li
      className="relative touch-pan-y overflow-hidden rounded-lg border bg-muted select-none"
      {...rowProps}
    >
      <div
        ref={actionsRef}
        className={cn(
          "absolute inset-y-0 right-0 flex items-center gap-1.5 px-2",
          !revealed && "invisible"
        )}
      >
        <Button variant="outline" onClick={() => onAction(recipe, "archive")}>
          <ArchiveIcon data-icon="inline-start" />
          Archive
        </Button>
        <Button variant="destructive" onClick={() => onAction(recipe, "delete")}>
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
      </div>
      <Item
        className={cn(
          "relative rounded-none bg-background",
          !dragging && "transition-transform duration-200 motion-reduce:transition-none"
        )}
        style={{ transform: `translateX(${offset}px)` }}
        onClick={open ? close : undefined}
      >
        <ItemContent className="min-w-0">
          <ItemTitle>{recipe.title}</ItemTitle>
          <ItemDescription className="flex flex-wrap gap-x-2">
            <span>{recipe.minutes} min</span>
            <span aria-hidden="true">·</span>
            <span>Serves {recipe.servings}</span>
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" />}
              aria-label={`Actions for ${recipe.title}`}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onAction(recipe, "archive")}>
                  <ArchiveIcon />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onAction(recipe, "delete")}
                >
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
