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
  collapsible: boolean;
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

/** A panel's scroll box: it fills the panel and scrolls its own content when the content is larger. @internal */
const panelClass =
  "peer relative box-border min-h-0 min-w-0 flex-1 overflow-auto outline-none focus-visible:isolate [[data-collapsed]>&]:hidden " +
  "forced-colors:[&[tabindex='0']]:outline-1 forced-colors:[&[tabindex='0']]:outline-solid forced-colors:[&[tabindex='0']]:-outline-offset-1";

/**
 * The handle: a 1px line in the border color that turns the ring color on hover, focus
 * and drag. A touch drag across it resizes; along it the touch is the page's, so a scroll
 * that starts on the handle's 44px touch target still scrolls (`touch-pan-y` on a handle
 * between side-by-side panels, `touch-pan-x` on one between stacked panels).
 *
 * @internal
 * @claim "A touch drag across it resizes" registry/ouro/components/ouro/resizable/resizable.touch.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.touch.test.tsx::resizes with a touch drag instead of scrolling the page)
 * @claim "A touch drag across it resizes" registry/ouro/components/ouro/resizable/resizable.touch.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.touch.test.tsx::lets a vertical swipe that starts on the handle scroll the page, and leaves the sizes alone)
 * @claim "The handle: a 1px line in" registry/ouro/components/ouro/resizable/resizable-styles.ts verify:fileLine(registry/ouro/components/ouro/resizable/resizable-styles.ts, /bg-border\stouch-pan-y\sselect-none\s/)
 * @claim "The handle: a 1px line in" registry/ouro/components/ouro/resizable/resizable-styles.ts verify:fileLine(registry/ouro/components/ouro/resizable/resizable-styles.ts, / pointer-fine:hover:bg-ring active:bg-ring /)
 */
const handleClass = {
  horizontal:
    "relative z-1 flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border touch-pan-y select-none " +
    "transition-colors duration-(--ouro-duration-fast) ease-[ease] pointer-fine:hover:bg-ring active:bg-ring " +
    "outline-ring outline-offset-1 focus-visible:bg-ring focus-visible:outline-2 focus-visible:outline-solid",
  vertical:
    "relative z-1 flex h-px w-full shrink-0 cursor-row-resize items-center justify-center bg-border touch-pan-x select-none " +
    "transition-colors duration-(--ouro-duration-fast) ease-[ease] pointer-fine:hover:bg-ring active:bg-ring " +
    "outline-ring outline-offset-1 focus-visible:bg-ring focus-visible:outline-2 focus-visible:outline-solid",
} as const;

/**
 * The handle's hit area with a fine pointer: 4px each side of the line. A coarse pointer gets 44px from `TouchTarget`. @internal
 *
 * @claim "The handle's hit area with a" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > gives the handle a hit area wider than its line)
 * @claim "A coarse pointer gets 44px from" registry/ouro/components/ouro/resizable/resizable.tsx verify:fileLine(registry/ouro/components/ouro/resizable/resizable.tsx, /<TouchTarget/)
 */
const hitAreaClass = {
  horizontal: "absolute inset-y-0 -inset-x-1",
  vertical: "absolute inset-x-0 -inset-y-1",
} as const;

/** The grip on the handle, so it reads as something to drag. @internal */
const gripClass = {
  horizontal: "pointer-events-none relative h-ouro-6 w-ouro-1_5 shrink-0 rounded-full border border-solid border-border bg-background",
  vertical: "pointer-events-none relative h-ouro-1_5 w-ouro-6 shrink-0 rounded-full border border-solid border-border bg-background",
} as const;

/**
 * The starting sizes: each panel's `defaultSize`, with the rest shared equally between the
 * panels that have none, scaled so they add up to 100.
 *
 * @internal
 * @claim "The starting sizes: each panel's `defaultSize`" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable layout > lays panels side by side at their default sizes with a handle between)
 * @claim "The starting sizes: each panel's `defaultSize`" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable layout > shares the space left over between panels without a defaultSize)
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
 * @claim "The range the panel before handle" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > resizes when dragged with a pointer, within the panels' limits)
 * @claim "The range the panel before handle" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > is a focusable separator for the panel before it)
 */
function limits(sizes: readonly number[], index: number, panels: readonly PanelLimits[]): { min: number; max: number } {
  const total = sizes[index]! + sizes[index + 1]!;
  const before = panels[index]!;
  const after = panels[index + 1]!;
  return {
    min: before.collapsible && total <= after.maxSize ? 0 : Math.max(before.minSize, total - after.maxSize),
    max: after.collapsible && before.maxSize >= total ? total : Math.min(before.maxSize, total - after.minSize),
  };
}

/**
 * New sizes with the panel before handle `index` at `size`, kept within both panels'
 * limits; the panel after it takes up the difference. A collapsible panel's size between 0
 * and its minSize snaps to the nearer of the two; on a tie the handle's direction decides.
 *
 * @internal
 * @claim "A collapsible panel's size between 0" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable handle (window splitter) > snaps a drag that lands under a collapsible panel's minSize to 0 or to minSize, by half)
 */
function clampSize(sizes: readonly number[], index: number, size: number, panels: readonly PanelLimits[]): number[] {
  const result = [...sizes];
  const shrinking = size < sizes[index]!;
  const growing = size > sizes[index]!;
  // A press that moves nothing changes nothing, even from a size the default sizes left in a gap.
  if (!shrinking && !growing) return result;
  const { min, max } = limits(sizes, index, panels);
  const before = panels[index]!;
  const after = panels[index + 1]!;
  const total = sizes[index]! + sizes[index + 1]!;
  let next = Math.min(Math.max(size, min), max);
  // The snap targets: 0 and minSize for a panel before the handle, total - minSize and total for one after it. A non-collapsible
  // panel's limits keep its size out of these gaps, so they need no check of their own.
  let ends: readonly number[] | undefined;
  // Stryker disable next-line EqualityOperator: at the edge itself the nearer end is the size it already has, so >= snaps it to where it is.
  const intoAfterGap = next > total - after.minSize;
  if (next < before.minSize) ends = [0, before.minSize];
  else if (intoAfterGap) ends = [total - after.minSize, total];
  if (ends) {
    // On a tie the handle's direction decides: a shrinking handle closes the panel before it and opens the one after it to minSize; a growing one the reverse.
    const target = next;
    let gap = Infinity;
    for (const end of shrinking ? ends : [...ends].reverse()) {
      const distance = Math.abs(end - target);
      if (end >= min && end <= max && distance < gap) {
        next = end;
        gap = distance;
      }
    }
  }
  result[index] = next;
  result[index + 1] = total - next;
  return result;
}

/**
 * Whether a saved value is a layout for `count` panels: that many numbers adding up to 100. @internal
 *
 * @claim "Whether a saved value is a" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable autoSaveId > restores and saves the layout in localStorage)
 * @claim "Whether a saved value is a" registry/ouro/components/ouro/resizable/resizable-styles.ts verify:fileLine(registry/ouro/components/ouro/resizable/resizable-styles.ts, /Math\.abs\(value\.reduce/)
 */
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
 * @claim "The text saved under `autoSaveId`, or" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable autoSaveId > keeps working when storage throws)
 * @claim "The text saved under `autoSaveId`, or" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable autoSaveId > starts at the default sizes when nothing is saved yet)
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
 * The smallest size a saved panel keeps: 0 for a collapsible panel saved closed, else its minSize.
 *
 * @internal
 * @claim "The smallest size a saved panel keeps" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:testExists(registry/ouro/components/ouro/resizable/resizable.test.tsx::Resizable autoSaveId > restores a collapsible panel closed from a saved 0, but not a panel that cannot close)
 */
const floorOf = (panel: PanelLimits, size: number) => (panel.collapsible && size === 0 ? 0 : panel.minSize);

/**
 * The saved layout for `panels`, or `null` when the text is missing or is not a layout for
 * that many panels. A layout outside the panels' limits (saved before an app changed
 * `minSize` or `maxSize`) is fitted into them: each size is clamped, and the difference
 * goes to the panels that still have room, in order.
 *
 * @internal
 * @claim "A layout outside the panels' limits" registry/ouro/components/ouro/resizable/resizable.test.tsx verify:fileLine(registry/ouro/components/ouro/resizable/resizable.test.tsx, /fits\sa\ssaved\slayout\s%s\sinto\sthe\spanels'\slimits/)
 */
function parseSaved(text: string | null, panels: readonly PanelLimits[]): number[] | null {
  let saved: unknown;
  try {
    saved = JSON.parse(text ?? "null");
  } catch {
    return null;
  }
  if (!isSavedLayout(saved, panels.length)) return null;
  const sizes = saved.map((size, index) => Math.min(Math.max(size, floorOf(panels[index]!, size)), panels[index]!.maxSize));
  let rest = 100 - sizes.reduce((sum, size) => sum + size, 0);
  sizes.forEach((size, index) => {
    const room = rest > 0 ? panels[index]!.maxSize - size : floorOf(panels[index]!, size) - size;
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
