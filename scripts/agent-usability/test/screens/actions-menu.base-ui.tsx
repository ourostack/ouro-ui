import { Menu } from "@base-ui/react/menu";
import type { Recipe } from "./api/recipes";

// The recipe list's actions menu built on Base UI's Menu, which renders the popup in a portal
// on the body, outside every landmark. shadcn/ui's menu and a menu built in the Ouro HX app
// both produce this structure, so the scorer's tests use it to prove a portaled menu passes.

export function ActionsMenu({ recipe, act }: { recipe: Recipe; act: (recipe: Recipe, action: "archive" | "delete") => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="button" aria-label={`Actions for ${recipe.title}`}>
        ⋯
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4}>
          <Menu.Popup className="menu-popup">
            <Menu.Item className="menu-item" onClick={() => act(recipe, "archive")}>
              Archive
            </Menu.Item>
            <Menu.Item className="menu-item" onClick={() => act(recipe, "delete")}>
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
