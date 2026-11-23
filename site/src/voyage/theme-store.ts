import { useCallback, useEffect, useSyncExternalStore } from "react";
import { applyLive, clearLive, isSouthern, LIVE_PALETTES, liveCss, localTimeZone, skyAt, WEATHERS, type Phase, type Season, type Weather } from "../themes/live";
import { applyStoredTheme, PRESET_NAMES, safeStorage, storedWeather, THEME_KEY, type Mode, type PresetName, type ThemeChoice } from "../themes/prepaint";

/**
 * The page's theme, read from <html> (where the head script put it before paint) and written
 * back to localStorage, so every picker on the page and the next visit agree.
 */
export interface SiteTheme {
  /** Live, or the preset the reader chose. */
  preset: ThemeChoice;
  /** Light or dark, as the page shows it now. */
  mode: Mode;
  /** Light, dark, or "system" while the page follows the OS. */
  scheme: Mode | "system";
  /** Live's sky, while Live is on. */
  sky: { phase: Phase; season: Season; weather: Weather } | undefined;
}

/** The event storeTheme sends after each change. */
const CHANGED = "ouro-site-theme";

const SERVER: SiteTheme = { preset: "live", mode: "light", scheme: "system", sky: undefined };
let cache: { key: string; value: SiteTheme } | undefined;

function storedScheme(): Mode | "system" {
  try {
    const mode = (JSON.parse(safeStorage()?.getItem(THEME_KEY) ?? "{}") as { mode?: unknown } | null)?.mode;
    return mode === "light" || mode === "dark" ? mode : "system";
  } catch {
    return "system";
  }
}

/** On <html> while a look is previewed (previewTheme): the choice the preview stands in for. */
const PREVIEW_FROM = "data-preview-from";

function isChoice(name: string | null): name is ThemeChoice {
  return name === "live" || (PRESET_NAMES as readonly string[]).includes(name ?? "");
}

function read(): SiteTheme {
  const root = document.documentElement;
  const attribute = root.getAttribute("data-theme");
  const live = root.hasAttribute("data-live");
  // While a look is previewed the page wears it, but the choice is still the one it stands in for.
  const from = root.getAttribute(PREVIEW_FROM);
  const preset: ThemeChoice = isChoice(from) ? from : live ? "live" : (PRESET_NAMES as readonly string[]).includes(attribute ?? "") ? (attribute as PresetName) : "pearl";
  const mode: Mode = root.classList.contains("dark") ? "dark" : "light";
  const scheme = storedScheme();
  const phase = root.getAttribute("data-sky") as Phase | null;
  const season = root.getAttribute("data-season") as Season | null;
  const weather = (root.getAttribute("data-weather") ?? "clear") as Weather;
  const key = `${preset}|${mode}|${scheme}|${live ? `${phase}|${season}|${weather}` : ""}`;
  if (cache?.key !== key) cache = { key, value: { preset, mode, scheme, sky: live && phase && season ? { phase, season, weather } : undefined } };
  return cache.value;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-live", "data-sky", "data-season", "data-weather"] });
  // A stored change the page cannot see, such as going back to the OS's mode while it matches.
  window.addEventListener(CHANGED, onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener(CHANGED, onChange);
  };
}

/** Puts a choice's look on the page at once: its CSS, and Live's sky or none. */
function paint(preset: ThemeChoice): void {
  document.documentElement.setAttribute("data-theme", preset === "live" ? "pearl" : preset);
  if (preset === "live") paintLive();
  else clearLive(document);
}

/**
 * Shows a look on the whole page at once, without choosing it, while the pointer or keyboard focus rests on it in a
 * picker; `null` puts the chosen one back. Nothing is stored, and every picker keeps showing the choice.
 */
export function previewTheme(preset: ThemeChoice | null): void {
  const root = document.documentElement;
  const from = root.getAttribute(PREVIEW_FROM);
  if (preset === null) {
    if (!isChoice(from)) return;
    root.removeAttribute(PREVIEW_FROM);
    paint(from);
    return;
  }
  if (!isChoice(from)) root.setAttribute(PREVIEW_FROM, read().preset);
  paint(preset);
}

/** Paints Live's sky for now, as the head script does on load. */
export function paintLive(): void {
  applyLive(document, new Date(), localTimeZone(), storedWeather(safeStorage(), WEATHERS), LIVE_PALETTES, skyAt, isSouthern, liveCss);
}

/** Where a change came from on screen, so the new look can spread out from that point. */
export interface Origin {
  x: number;
  y: number;
}

/** The circle a new theme spreads out in: added on the first change, so the first load's CSS does not carry it. */
const REVEAL_CSS =
  "::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}" +
  "::view-transition-new(root){animation:site-reveal 650ms cubic-bezier(0.23,1,0.32,1)}" +
  "@keyframes site-reveal{from{clip-path:circle(0 at var(--reveal-x) var(--reveal-y))}to{clip-path:circle(150vmax at var(--reveal-x) var(--reveal-y))}}";

function addRevealCss(): void {
  if (document.getElementById("ouro-reveal")) return;
  const style = document.createElement("style");
  style.id = "ouro-reveal";
  style.textContent = REVEAL_CSS;
  document.head.append(style);
  document.addEventListener("click", passClickThrough, true);
}

/** The reveal on screen now, if one is. */
let running: { skipTransition(): void; ready: Promise<unknown>; finished: Promise<unknown> } | null = null;

/**
 * While a view transition runs, the browser sends every click to <html>, so a dot pressed mid-reveal
 * would be lost. A click there that falls on a theme dot finishes the reveal at once and presses the dot.
 */
function passClickThrough(event: MouseEvent): void {
  if (!running || event.target !== document.documentElement) return;
  const { clientX: x, clientY: y } = event;
  // The docs demos' looks too (components/demo-looks.tsx), which a reader flicks through one after another.
  const dot = [...document.querySelectorAll<HTMLElement>("[data-site-preset], .site-dot, [data-ouro='theme-picker'] button[data-preset], [data-ouro='popover'] button[data-preset], [data-site-demo-looks] button")].find((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  });
  running.skipTransition();
  running = null;
  dot?.click();
}

/** Ends the reveal on screen now, if one is, and resolves once the browser has let go of the page. */
export async function finishReveal(): Promise<void> {
  const current = running;
  if (!current) return;
  current.skipTransition();
  running = null;
  await current.finished.catch(() => undefined);
}

/**
 * Runs `change` inside a view transition where the browser has them, so the new theme spreads out
 * from `origin` in a circle (REVEAL_CSS); with reduced motion, or without view transitions, it
 * applies at once.
 */
function transition(change: () => void, origin: Origin | undefined): void {
  const start = (document as Document & { startViewTransition?: (update: () => void) => unknown }).startViewTransition;
  if (!start || !origin || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    change();
    return;
  }
  addRevealCss();
  const root = document.documentElement;
  root.style.setProperty("--reveal-x", `${origin.x}px`);
  root.style.setProperty("--reveal-y", `${origin.y}px`);
  const current = start.call(document, change) as NonNullable<typeof running>;
  running = current;
  // A skipped transition rejects `ready`; that is expected, not an error.
  current.ready.catch(() => undefined);
  void current.finished.finally(() => {
    if (running === current) running = null;
  });
}

/** Writes a choice and applies it at once, as the head script would on the next load. */
export function storeTheme(change: { preset?: ThemeChoice; mode?: Mode | "system"; weather?: Weather }, origin?: Origin): void {
  // A look chosen while previewed is already on the page, so the preview just ends; any other change starts from the choice.
  if (change.preset !== undefined) document.documentElement.removeAttribute(PREVIEW_FROM);
  else previewTheme(null);
  const storage = safeStorage();
  let stored: { preset?: string; mode?: string; weather?: string };
  try {
    stored = JSON.parse(storage?.getItem(THEME_KEY) ?? "{}") ?? {};
  } catch {
    stored = {};
  }
  const next: { preset?: string; mode?: string; weather?: string } = { ...stored, ...change };
  if (next.mode === "system") delete next.mode;
  try {
    storage?.setItem(THEME_KEY, JSON.stringify(next));
  } catch {
    // Storage refused (private mode, quota): the choice still applies to this page.
  }
  transition(() => {
    const root = document.documentElement;
    const preset = (next.preset ?? read().preset) as ThemeChoice;
    root.setAttribute("data-theme", preset === "live" ? "pearl" : preset);
    if (next.mode === "light" || next.mode === "dark") root.classList.toggle("dark", next.mode === "dark");
    else applyStoredTheme(storage, root, matchMedia("(prefers-color-scheme: dark)").matches, PRESET_NAMES);
    if (preset === "live") paintLive();
    else clearLive(document);
  }, origin);
  window.dispatchEvent(new Event(CHANGED));
}

/** The point at the middle of the element an event came from, for a change's spread. */
export function originOf(event: { currentTarget: EventTarget | null }): Origin | undefined {
  const target = event.currentTarget;
  if (!(target instanceof Element)) return undefined;
  const box = target.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * While Live is on, moves its sky on with the clock: checked each minute and whenever the page comes back into
 * view. An automated browser (Playwright, WebDriver, an agent's headless page) sets navigator.webdriver; nobody
 * is there to watch the sky move, and Live is the home page's default theme, so the sweep that screenshots the
 * page twice in a row (states-sweep.ts) ran long enough for this minute tick to land between a retake's two
 * takes and find an unrelated control's picture differ (ourostack/ouro-ui#2966, the same pattern as #2917). Skip
 * the tick there: Live keeps the sky the head script painted for the whole run. See
 * registry/ouro/lib/ouro/feedback.ts for the same check.
 */
export function useLiveClock(live: boolean): void {
  useEffect(() => {
    if (!live || (typeof navigator !== "undefined" && navigator.webdriver)) return;
    const tick = () => paintLive();
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [live]);
}

/** The current theme, and setters for the choice, the mode and Live's weather. The server renders Pearl, light. */
export function useSiteTheme(): SiteTheme & {
  setPreset: (preset: ThemeChoice, origin?: Origin) => void;
  setMode: (mode: Mode | "system", origin?: Origin) => void;
  setWeather: (weather: Weather) => void;
} {
  const theme = useSyncExternalStore(subscribe, read, () => SERVER);
  const setPreset = useCallback((preset: ThemeChoice, origin?: Origin) => storeTheme({ preset }, origin), []);
  const setMode = useCallback((mode: Mode | "system", origin?: Origin) => storeTheme({ mode }, origin), []);
  const setWeather = useCallback((weather: Weather) => storeTheme({ weather }), []);
  return { ...theme, setPreset, setMode, setWeather };
}
