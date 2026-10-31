import { applyLive, isSouthern, LIVE_PALETTES, liveCss, localTimeZone, skyAt, WEATHERS } from "./live";

/**
 * The theme a reader chose, applied before first paint. The prerendered <head> runs
 * `prepaintScript` inline (head.ts), so a stored preset's colours are on the page before any
 * stylesheet-driven paint and before the client entry loads; the voyage page's picker writes the
 * same key (theme-store.ts). Dark mode is shadcn's `.dark` class on <html>.
 */

/**
 * The localStorage key: JSON `{ "preset": "abyss", "mode": "dark" }`; `mode` is absent to follow the OS.
 * `preset` may also be "live" (live.ts): Pearl under the reader's sky, with `weather` saying which.
 */
export const THEME_KEY = "ouro-site-theme";

/** Every preset, the default first. themes.test.ts checks this list against themes.json. */
export const PRESET_NAMES = ["pearl", "abyss", "brass", "chart", "coral", "cookbook"] as const;
export type PresetName = (typeof PRESET_NAMES)[number];
/** What a reader can choose: Live, or one of the presets. */
export type ThemeChoice = "live" | PresetName;
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
  const preset = typeof stored.preset === "string" && (stored.preset === "live" || presets.indexOf(stored.preset) !== -1) ? stored.preset : presets[0]!;
  const mode = stored.mode === "light" || stored.mode === "dark" ? stored.mode : undefined;
  // Live is Pearl under the reader's sky: Pearl's rules apply, and live.ts tints them.
  root.setAttribute("data-theme", preset === "live" ? presets[0]! : preset);
  root.classList.toggle("dark", mode ? mode === "dark" : prefersDark);
  return { preset, mode };
}

/**
 * Marks the stored preset's buttons pressed (`[data-site-preset]`, aria-pressed) once the body is
 * parsed, so a screen reader hears the right one before the page hydrates; CSS keyed on
 * html[data-theme] paints the same choice. Serialized like applyStoredTheme: self-contained.
 */
export function pressStoredPreset(document: { querySelectorAll(selector: string): ArrayLike<{ getAttribute(name: string): string | null; setAttribute(name: string, value: string): void }> }, preset: string): void {
  const buttons = document.querySelectorAll("[data-site-preset]");
  for (let index = 0; index < buttons.length; index++) {
    const button = buttons[index]!;
    button.setAttribute("aria-pressed", button.getAttribute("data-site-preset") === preset ? "true" : "false");
  }
}

/** The stored weather for Live, or "clear". Self-contained, for the prepaint script. */
export function storedWeather(storage: Pick<Storage, "getItem"> | null, weathers: readonly string[]): string {
  try {
    const parsed: unknown = JSON.parse((storage && storage.getItem("ouro-site-theme")) || "{}");
    const weather = parsed && typeof parsed === "object" ? (parsed as { weather?: unknown }).weather : undefined;
    return typeof weather === "string" && weathers.indexOf(weather) !== -1 ? weather : "clear";
  } catch {
    return "clear";
  }
}

/** Live's part of the inline script: when the stored choice is Live, its sky before first paint. */
const liveScript = `if(t.preset==="live"){(${applyLive.toString()})(document,new Date(),(${localTimeZone.toString()})(),(${storedWeather.toString()})(s,${JSON.stringify(WEATHERS)}),${JSON.stringify(LIVE_PALETTES)},${skyAt.toString()},${isSouthern.toString()},${liveCss.toString()})}`;

/** The inline script for <head>: the functions above, called on the page. */
export const prepaintScript = `try{var s=(function(){try{return localStorage}catch(e){return null}})();var t=(${applyStoredTheme.toString()})(s,document.documentElement,matchMedia("(prefers-color-scheme: dark)").matches,${JSON.stringify(PRESET_NAMES)});${liveScript}document.addEventListener("DOMContentLoaded",function(){(${pressStoredPreset.toString()})(document,t.preset)})}catch(e){}`;

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
