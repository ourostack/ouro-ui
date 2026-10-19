/**
 * The theme a reader chose, applied before first paint. The prerendered <head> runs
 * `prepaintScript` inline (head.ts), so a stored preset's colours are on the page before any
 * stylesheet-driven paint and before the client entry loads; the voyage page's picker writes the
 * same key (theme-store.ts). Dark mode is shadcn's `.dark` class on <html>.
 */

/** The localStorage key: JSON `{ "preset": "abyss", "mode": "dark" }`; `mode` is absent to follow the OS. */
export const THEME_KEY = "ouro-site-theme";

/** Every preset, the default first. themes.test.ts checks this list against themes.json. */
export const PRESET_NAMES = ["sleek", "abyss", "brass", "chart", "coral", "cookbook"] as const;
export type PresetName = (typeof PRESET_NAMES)[number];
export type Mode = "light" | "dark";

export interface StoredTheme {
  preset: PresetName;
  /** The reader's Surfaced (light) or Submerged (dark) choice; undefined follows the OS. */
  mode: Mode | undefined;
}

/**
 * Reads the stored choice and sets `data-theme` and `.dark` on the root. It is serialized into the
 * page with Function.prototype.toString, so it must stay self-contained: no imports, no closures.
 */
export function applyStoredTheme(
  storage: Pick<Storage, "getItem"> | null,
  root: { setAttribute(name: string, value: string): void; classList: { toggle(name: string, force: boolean): unknown } },
  prefersDark: boolean,
  presets: readonly string[],
): { preset: string; mode: string | undefined } {
  let stored: { preset?: unknown; mode?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse((storage && storage.getItem("ouro-site-theme")) || "{}");
    if (parsed && typeof parsed === "object") stored = parsed as typeof stored;
  } catch {
    stored = {};
  }
  const preset = typeof stored.preset === "string" && presets.indexOf(stored.preset) !== -1 ? stored.preset : presets[0]!;
  const mode = stored.mode === "light" || stored.mode === "dark" ? stored.mode : undefined;
  root.setAttribute("data-theme", preset);
  root.classList.toggle("dark", mode ? mode === "dark" : prefersDark);
  return { preset, mode };
}

/** The inline script for <head>: the function above, called on the page. */
export const prepaintScript = `try{(${applyStoredTheme.toString()})((function(){try{return localStorage}catch(e){return null}})(),document.documentElement,matchMedia("(prefers-color-scheme: dark)").matches,${JSON.stringify(PRESET_NAMES)})}catch(e){}`;

/** While the page is open, `.dark` follows the OS, unless the reader chose a mode. */
export function followSystemScheme(): void {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => applyStoredTheme(safeStorage(), document.documentElement, media.matches, PRESET_NAMES);
  apply();
  media.addEventListener("change", apply);
}

/** localStorage, or null where the browser refuses it (a sandboxed frame, some private modes). */
export function safeStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
