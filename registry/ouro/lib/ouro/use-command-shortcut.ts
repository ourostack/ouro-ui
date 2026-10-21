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
  // A character such as ? needs Shift on most layouts, so for one Shift is part of the
  // character, not a modifier to match: "?" and "shift+?" both fire on Shift+/.
  const character = key.length === 1 && !/^[a-z\d]$/.test(key);
  if (
    event.metaKey !== wanted.meta ||
    event.ctrlKey !== wanted.ctrl ||
    event.altKey !== wanted.alt ||
    (!character && event.shiftKey !== wanted.shift)
  ) {
    return false;
  }
  if (/^[a-z]$/.test(key)) return event.code === `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return event.code === `Digit${key}`;
  return event.key.toLowerCase() === key;
}

/** Whether the key press comes from a field the user types in. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/**
 * The open state for a `Command` palette, toggled by a keyboard shortcut anywhere on the
 * page: `"mod+k"` (the default) is ⌘K on Apple platforms and Ctrl+K elsewhere. Pass the
 * keys as a string joined by `+` or as an array, with the names `Kbd` uses (`mod`, `cmd`,
 * `ctrl`, `alt`, `shift`). When it fires, the browser's own action for that key
 * combination is prevented. It never fires while an input method is composing text. In a
 * text field (an input, a textarea, a select or a contenteditable element) it fires only
 * when it includes `mod`, `meta`/`cmd` or `ctrl`, so `"/"` never takes a typed character
 * and `"mod+k"` still opens the palette from a field. A character that needs Shift, such
 * as `"?"`, matches by the character typed, so `"?"` and `"shift+?"` both fire on Shift+/.
 *
 * @example
 * const [open, setOpen] = useCommandShortcut("mod+k");
 * <Command title="Command palette" open={open} onOpenChange={setOpen} items={commands} />
 * @claim "It never fires while an input" registry/ouro/lib/ouro/use-command-shortcut.test.tsx verify:testExists(registry/ouro/lib/ouro/use-command-shortcut.test.tsx::useCommandShortcut > does not fire while an input method is composing text)
 * @claim "In a text field (an input" registry/ouro/lib/ouro/use-command-shortcut.test.tsx verify:testExists(registry/ouro/lib/ouro/use-command-shortcut.test.tsx::useCommandShortcut > takes mod+k from an input with real typing, and keeps the typed characters)
 * @claim "In a text field (an input" registry/ouro/lib/ouro/use-command-shortcut.test.tsx verify:fileLine(registry/ouro/lib/ouro/use-command-shortcut.test.tsx, /never\stakes\sa\sshortcut\swithout\smod,\smeta\sor\sctrl\sfrom\styping\sin/)
 */
export function useCommandShortcut(shortcut: string | readonly string[] = "mod+k"): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [open, setOpen] = useState(false);
  const keys = typeof shortcut === "string" ? shortcut.split("+") : shortcut;
  const id = keys.join("+");
  useEffect(() => {
    const parts = id.split("+");
    // A shortcut with a command modifier types nothing, so it may fire from a field.
    const commandKey = parts.some((name) => ["mod", "meta", "cmd", "command", "ctrl", "control"].includes(name.toLowerCase()));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || !matches(event, parts)) return;
      if (!commandKey && isEditable(event.target)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [id]);
  return [open, setOpen];
}
