import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Recipe } from "./api/recipes";

// The recipe list's actions menu built with shadcn/ui's own menu, for preflight.mts, which
// scores it in a real shadcn arm. It resolves only inside an arm app.

export function ActionsMenu({ recipe, act }: { recipe: Recipe; act: (recipe: Recipe, action: "archive" | "delete") => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="button" aria-label={`Actions for ${recipe.title}`}>
        ⋯
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => act(recipe, "archive")}>Archive</DropdownMenuItem>
        <DropdownMenuItem onClick={() => act(recipe, "delete")}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
