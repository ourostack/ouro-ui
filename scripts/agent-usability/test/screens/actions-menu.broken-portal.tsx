import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Recipe } from "./api/recipes";

// A broken actions menu for the scorer's tests: it renders in a portal on the body, as library
// menus do, but its items are plain buttons in an element with the menu role, which axe-core's
// WCAG rules fail (aria-required-children). The scan must still charge for it.

export function ActionsMenu({ recipe, act }: { recipe: Recipe; act: (recipe: Recipe, action: "archive" | "delete") => void }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) menu.current?.querySelector("button")?.focus();
  }, [open]);

  return (
    <>
      <button type="button" className="button" aria-label={`Actions for ${recipe.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        ⋯
      </button>
      {open &&
        createPortal(
          <div ref={menu} role="menu" aria-label={`Actions for ${recipe.title}`} className="menu-popup">
            <button type="button" className="menu-item" onClick={() => act(recipe, "archive")}>
              Archive
            </button>
            <button type="button" className="menu-item" onClick={() => act(recipe, "delete")}>
              Delete
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
