import { useCallback, useSyncExternalStore } from "react";
import { applyStoredTheme, PRESET_NAMES, safeStorage, THEME_KEY, type Mode, type PresetName } from "../themes/prepaint";

/**
 * The page's theme, read from <html> (where the head script put it before paint) and written
 * back to localStorage, so every picker on the page and the next visit agree.
 */
export interface SiteTheme {
  preset: PresetName;
  /** Surfaced (light) or Submerged (dark), as the page shows it now. */
  mode: Mode;
}

const SERVER: SiteTheme = { preset: "pearl", mode: "light" };
let cache: { key: string; value: SiteTheme } | undefined;

function read(): SiteTheme {
  const root = document.documentElement;
  const attribute = root.getAttribute("data-theme");
  const preset = (PRESET_NAMES as readonly string[]).includes(attribute ?? "") ? (attribute as PresetName) : "pearl";
  const mode: Mode = root.classList.contains("dark") ? "dark" : "light";
  const key = `${preset}|${mode}`;
  if (cache?.key !== key) cache = { key, value: { preset, mode } };
  return cache.value;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  return () => observer.disconnect();
}

/** Writes a choice and applies it at once, as the head script would on the next load. */
export function storeTheme(change: { preset?: PresetName; mode?: Mode }): void {
  const storage = safeStorage();
  let stored: { preset?: string; mode?: string };
  try {
    stored = JSON.parse(storage?.getItem(THEME_KEY) ?? "{}") ?? {};
  } catch {
    stored = {};
  }
  const next = { ...stored, ...change };
  try {
    storage?.setItem(THEME_KEY, JSON.stringify(next));
  } catch {
    // Storage refused (private mode, quota): the choice still applies to this page.
  }
  const root = document.documentElement;
  const preset = next.preset ?? read().preset;
  root.setAttribute("data-theme", preset);
  if (next.mode === "light" || next.mode === "dark") root.classList.toggle("dark", next.mode === "dark");
  else applyStoredTheme(storage, root, matchMedia("(prefers-color-scheme: dark)").matches, PRESET_NAMES);
}

/** The current theme, and setters for the preset and the mode. The server renders Pearl, light. */
export function useSiteTheme(): SiteTheme & { setPreset: (preset: PresetName) => void; setMode: (mode: Mode) => void } {
  const theme = useSyncExternalStore(subscribe, read, () => SERVER);
  const setPreset = useCallback((preset: PresetName) => storeTheme({ preset }), []);
  const setMode = useCallback((mode: Mode) => storeTheme({ mode }), []);
  return { ...theme, setPreset, setMode };
}
