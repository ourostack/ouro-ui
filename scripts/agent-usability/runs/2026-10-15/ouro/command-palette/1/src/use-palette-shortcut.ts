import { useEffect, useState } from "react";
import { lastInput } from "@/lib/ouro/last-input";

/**
 * Open state for the command palette, toggled by Ctrl+K or ⌘K anywhere on the page,
 * including inside text fields. The browser's own action for the keys is prevented.
 */
export function usePaletteShortcut(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      if (event.key.toLowerCase() !== "k" || event.altKey || event.shiftKey) return;
      if (!(event.ctrlKey || event.metaKey) || (event.ctrlKey && event.metaKey)) return;
      event.preventDefault();
      setOpen((wasOpen) => !wasOpen);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return [open, setOpen];
}

/**
 * Puts focus in the palette's search field once it opens. Below 640px the palette is a
 * bottom sheet that focuses its panel; this moves focus on to the field, except after a
 * touch or pen tap, where the panel keeps it so no software keyboard pops up.
 */
export function useFocusPaletteSearch(open: boolean): void {
  useEffect(() => {
    if (!open || lastInput() === "touch" || lastInput() === "pen") return;
    let frame = 0;
    let tries = 0;
    const focusSearch = () => {
      const input = document.querySelector<HTMLInputElement>('[role="dialog"] [data-ouro="command"] input');
      const active = document.activeElement;
      // Wait for the dialog to place its own focus, then take it over only from the panel.
      if (input && active !== input && active instanceof HTMLElement && active.getAttribute("role") === "dialog") {
        input.focus();
      }
      if (document.activeElement !== input && ++tries < 30) frame = requestAnimationFrame(focusSearch);
    };
    frame = requestAnimationFrame(focusSearch);
    return () => cancelAnimationFrame(frame);
  }, [open]);
}
