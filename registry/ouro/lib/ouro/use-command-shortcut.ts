"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** The modifier names a shortcut may use, by the canonical name it checks. */
const modifiers: Readonly<Record<string, "mod" | "meta" | "ctrl" | "alt" | "shift">> = {
  mod: "mod",
  cmd: "meta",
  command: "meta",
  meta: "meta",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
};

/** Whether the platform's command key is ⌘ (macOS, iOS, iPadOS) rather than Ctrl. */
function isApple(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod|ios/i.test(nav.userAgentData?.platform ?? nav.platform);
}

/**
 * Whether a key press is the shortcut: exactly its modifiers, and its key. A letter or
 * digit matches by its physical key (`KeyK`), so Option on a Mac, which changes the
 * character, still matches; other keys match by name (`/`, `Enter`).
 */
function matches(event: KeyboardEvent, keys: readonly string[]): boolean {
  const wanted = { meta: false, ctrl: false, alt: false, shift: false };
  let key = "";
  for (const name of keys) {
    const modifier = modifiers[name.toLowerCase()];
    if (modifier === "mod") wanted[isApple() ? "meta" : "ctrl"] = true;
    else if (modifier) wanted[modifier] = true;
    else key = name.toLowerCase();
  }
  if (event.metaKey !== wanted.meta || event.ctrlKey !== wanted.ctrl || event.altKey !== wanted.alt || event.shiftKey !== wanted.shift) {
    return false;
  }
  if (/^[a-z]$/.test(key)) return event.code === `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return event.code === `Digit${key}`;
  return event.key.toLowerCase() === key;
}

/**
 * The open state for a `Command` palette, toggled by a keyboard shortcut anywhere on the
 * page: `"mod+k"` (the default) is ⌘K on Apple platforms and Ctrl+K elsewhere. Pass the
 * keys as a string joined by `+` or as an array, with the names `Kbd` uses (`mod`, `cmd`,
 * `ctrl`, `alt`, `shift`). The shortcut works while focus is in a text field too, and the
 * browser's own action for it is prevented.
 *
 * @example
 * const [open, setOpen] = useCommandShortcut("mod+k");
 * <Command title="Command palette" open={open} onOpenChange={setOpen} items={commands} />
 */
export function useCommandShortcut(shortcut: string | readonly string[] = "mod+k"): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [open, setOpen] = useState(false);
  const keys = typeof shortcut === "string" ? shortcut.split("+") : shortcut;
  const id = keys.join("+");
  useEffect(() => {
    const parts = id.split("+");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !matches(event, parts)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [id]);
  return [open, setOpen];
}
