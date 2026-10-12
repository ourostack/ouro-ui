export {
  clampSize,
  gripClass,
  groupClass,
  handleClass,
  hitAreaClass,
  initialSizes,
  KEY_STEP,
  limits,
  panelClass,
  parseSaved,
  readSavedText,
  storageKey,
  subscribeStorage,
  type PanelLimits,
};

// Class strings, values and helpers for Resizable and its parts, apart from the components
// so each component file exports only components (React Fast Refresh). Class strings are
// literal so the app's Tailwind finds them when it compiles.

/** A panel's size limits and default, in percent of the group. @internal */
interface PanelLimits {
  defaultSize: number | undefined;
  minSize: number;
  maxSize: number;
}

/** How far one arrow key press moves a handle, in percent of the group. @internal */
const KEY_STEP = 10;

/** The localStorage key for a group's `autoSaveId`. @internal */
const storageKey = (autoSaveId: string) => `ouro-resizable:${autoSaveId}`;

/** @internal */
const groupClass = {
  horizontal: "flex h-full w-full min-h-0 min-w-0 data-ouro-resizing:select-none",
  vertical: "flex h-full w-full min-h-0 min-w-0 flex-col data-ouro-resizing:select-none",
} as const;

/** A panel: it scrolls its own content when the content is larger than the panel. @internal */
const panelClass =
  "relative box-border min-h-0 min-w-0 overflow-auto " +
  "outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid";

/**
 * The handle: a 1px line in the border color that turns the ring color on hover, focus
 * and drag. `touch-none` keeps a touch drag on it resizing instead of scrolling the page.
 *
 * @internal
 */
const handleClass = {
  horizontal:
    "relative z-1 flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border touch-none select-none " +
    "transition-colors duration-(--ouro-duration-fast) ease-out hover:bg-ring active:bg-ring " +
    "outline-ring outline-offset-1 focus-visible:bg-ring focus-visible:outline-2 focus-visible:outline-solid",
  vertical:
    "relative z-1 flex h-px w-full shrink-0 cursor-row-resize items-center justify-center bg-border touch-none select-none " +
    "transition-colors duration-(--ouro-duration-fast) ease-out hover:bg-ring active:bg-ring " +
    "outline-ring outline-offset-1 focus-visible:bg-ring focus-visible:outline-2 focus-visible:outline-solid",
} as const;

/** The handle's hit area with a fine pointer: 4px each side of the line. A coarse pointer gets 44px from `TouchTarget`. @internal */
const hitAreaClass = {
  horizontal: "absolute inset-y-0 -inset-x-1",
  vertical: "absolute inset-x-0 -inset-y-1",
} as const;

/** The grip on the handle, so it reads as something to drag. @internal */
const gripClass = {
  horizontal: "pointer-events-none relative h-6 w-1.5 shrink-0 rounded-full border border-solid border-border bg-background",
  vertical: "pointer-events-none relative h-1.5 w-6 shrink-0 rounded-full border border-solid border-border bg-background",
} as const;

/**
 * The starting sizes: each panel's `defaultSize`, with the rest shared equally between the
 * panels that have none, scaled so they add up to 100.
 *
 * @internal
 */
function initialSizes(panels: readonly PanelLimits[]): number[] {
  const defined = panels.reduce((sum, panel) => sum + (panel.defaultSize ?? 0), 0);
  const open = panels.filter((panel) => panel.defaultSize === undefined).length;
  const share = Math.max(0, 100 - defined) / Math.max(open, 1);
  const sizes = panels.map((panel) => panel.defaultSize ?? share);
  const total = Math.max(sizes.reduce((sum, size) => sum + size, 0), Number.EPSILON);
  return sizes.map((size) => (size * 100) / total);
}

/**
 * The range the panel before handle `index` can take, given its limits and the limits of
 * the panel after it (the two share their combined size).
 *
 * @internal
 */
function limits(sizes: readonly number[], index: number, panels: readonly PanelLimits[]): { min: number; max: number } {
  const total = sizes[index]! + sizes[index + 1]!;
  return {
    min: Math.max(panels[index]!.minSize, total - panels[index + 1]!.maxSize),
    max: Math.min(panels[index]!.maxSize, total - panels[index + 1]!.minSize),
  };
}

/**
 * New sizes with the panel before handle `index` at `size`, kept within both panels'
 * limits; the panel after it takes up the difference.
 *
 * @internal
 */
function clampSize(sizes: readonly number[], index: number, size: number, panels: readonly PanelLimits[]): number[] {
  const { min, max } = limits(sizes, index, panels);
  const total = sizes[index]! + sizes[index + 1]!;
  const next = Math.min(Math.max(size, min), max);
  const result = [...sizes];
  result[index] = next;
  result[index + 1] = total - next;
  return result;
}

/** Whether a saved value is a layout for `count` panels: that many numbers adding up to 100. @internal */
function isSavedLayout(value: unknown, count: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === count &&
    value.every((size) => Number.isFinite(size)) &&
    Math.abs(value.reduce((sum: number, size: number) => sum + size, 0) - 100) < 0.5
  );
}

/**
 * The text saved under `autoSaveId`, or `null` when there is none or storage is
 * unavailable (private mode, a sandbox). Text, not the parsed layout, so React's external
 * store sees the same snapshot until the saved value changes.
 *
 * @internal
 */
function readSavedText(autoSaveId: string | undefined): string | null {
  if (!autoSaveId) return null;
  try {
    return localStorage.getItem(storageKey(autoSaveId));
  } catch {
    return null;
  }
}

/**
 * The saved layout for `panels`, or `null` when the text is missing or is not a layout for
 * that many panels. A layout outside the panels' limits (saved before an app changed
 * `minSize` or `maxSize`) is fitted into them: each size is clamped, and the difference
 * goes to the panels that still have room, in order.
 *
 * @internal
 */
function parseSaved(text: string | null, panels: readonly PanelLimits[]): number[] | null {
  let saved: unknown;
  try {
    saved = JSON.parse(text ?? "null");
  } catch {
    return null;
  }
  if (!isSavedLayout(saved, panels.length)) return null;
  const sizes = saved.map((size, index) => Math.min(Math.max(size, panels[index]!.minSize), panels[index]!.maxSize));
  let rest = 100 - sizes.reduce((sum, size) => sum + size, 0);
  sizes.forEach((size, index) => {
    const room = rest > 0 ? panels[index]!.maxSize - size : panels[index]!.minSize - size;
    const change = rest > 0 ? Math.min(rest, room) : Math.max(rest, room);
    sizes[index] = size + change;
    rest -= change;
  });
  return sizes;
}

/** Re-reads saved layouts when another tab saves one. @internal */
function subscribeStorage(onChange: () => void): () => void {
  addEventListener("storage", onChange);
  return () => removeEventListener("storage", onChange);
}
