import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * The palette's open state, opened by Ctrl+K or ⌘K anywhere on the page, also from a
 * text field. Both modifiers work on every platform, so a Mac with a PC keyboard works too.
 */
export function usePaletteShortcut(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || event.shiftKey) return;
      if (event.ctrlKey === event.metaKey) return;
      if (event.code !== "KeyK" && event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return [open, setOpen];
}
