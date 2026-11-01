export {
  artFrameClass,
  dismissedKey,
  haloClass,
  isDismissed,
  kinds,
  kindTone,
  keepDismissed,
  MOMENT_STORAGE_PREFIX,
  periods,
  rootClass,
  shownKey,
  sparkleClass,
  sparkles,
  subscribeMoments,
  takeShowing,
  type MomentCap,
  type MomentKind,
  type MomentPeriod,
};

// Class strings, values and the stored-state helpers for Moment, apart from the component so
// its file exports only components (React Fast Refresh). Class strings are literal so the
// app's Tailwind finds them when it compiles.

/** What a moment is about. @internal */
type MomentKind = "empty" | "loading" | "error" | "welcome" | "success";

/** The kinds, in the order the docs list them. @internal */
const kinds: readonly MomentKind[] = ["empty", "loading", "error", "welcome", "success"];

/** How long a celebration cap counts showings for. @internal */
type MomentPeriod = "day" | "week" | "month" | "ever";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Each period in milliseconds; a month is 30 days.
 *
 * @internal
 * @claim "Each period in milliseconds; a month" registry/ouro/components/ouro/moment/moment.test.tsx verify:testExists(registry/ouro/components/ouro/moment/moment.test.tsx::Moment cap > counts by id without a dismissKey, keeps ever for good, and never celebrates at times 0)
 */
const periods: Record<MomentPeriod, number> = { day: DAY_MS, week: 7 * DAY_MS, month: 30 * DAY_MS, ever: Number.POSITIVE_INFINITY };

/** At most `times` flourishes `per` period. @internal */
interface MomentCap {
  times: number;
  per: MomentPeriod;
}

/**
 * The prefix of every key Moment writes to `localStorage`.
 *
 * @internal
 * @claim "The prefix of every key Moment" registry/ouro/components/ouro/moment/moment.test.tsx verify:testExists(registry/ouro/components/ouro/moment/moment.test.tsx::Moment dismissal > stays dismissed through dismissKey, after a remount and in another tab)
 * @claim "The prefix of every key Moment" registry/ouro/components/ouro/moment/moment.test.tsx verify:testExists(registry/ouro/components/ouro/moment/moment.test.tsx::Moment cap > celebrates at most times per period, then again once the period has passed)
 */
const MOMENT_STORAGE_PREFIX = "ouro-moment:";

/** The key that remembers a dismissal. @internal */
const dismissedKey = (key: string) => `${MOMENT_STORAGE_PREFIX}dismissed:${key}`;

/** The key that keeps when a celebration last showed. @internal */
const shownKey = (key: string) => `${MOMENT_STORAGE_PREFIX}shown:${key}`;

/** Values kept in memory, for a browser that refuses localStorage (a private window), so a dismissal still holds on the page. */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

/**
 * Calls `onChange` when a moment is dismissed in this page or, through the storage event, in
 * another tab.
 *
 * @internal
 */
function subscribeMoments(onChange: () => void): () => void {
  listeners.add(onChange);
  addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    removeEventListener("storage", onChange);
  };
}

/** Whether the moment with this key was dismissed. @internal */
function isDismissed(key: string): boolean {
  return read(dismissedKey(key)) !== null;
}

/**
 * Remembers that the moment with this key was dismissed, and tells every moment on the page.
 *
 * @internal
 * @claim "Remembers that the moment with this" registry/ouro/components/ouro/moment/moment.test.tsx verify:testExists(registry/ouro/components/ouro/moment/moment.test.tsx::Moment dismissal > closes every copy of a moment on the page at once)
 */
function keepDismissed(key: string): void {
  write(dismissedKey(key), "1");
  for (const listener of [...listeners]) listener();
}

/**
 * Whether a celebration may show now under `cap`, and if so, records it. Only the showings
 * inside the period count, and only those are kept.
 *
 * @internal
 */
function takeShowing(key: string, cap: MomentCap, now: number): boolean {
  let stored: unknown;
  try {
    stored = JSON.parse(read(shownKey(key)) ?? "[]");
  } catch {
    stored = [];
  }
  const since = now - periods[cap.per];
  const recent = (Array.isArray(stored) ? stored : []).filter((time): time is number => typeof time === "number" && time > since && time <= now);
  if (recent.length >= cap.times) return false;
  write(shownKey(key), JSON.stringify([...recent, now]));
  return true;
}

/**
 * The colour each kind gives the art's `currentColor` and its celebration.
 *
 * @internal
 * @claim "The colour each kind gives the" registry/ouro/components/ouro/moment/moment.test.tsx verify:testExists(registry/ouro/components/ouro/moment/moment.test.tsx::Moment > names its kind in data-moment and colours the art from the theme by kind)
 */
const kindTone: Record<MomentKind, string> = {
  empty: "text-muted-foreground",
  loading: "text-muted-foreground",
  error: "text-destructive",
  welcome: "text-primary",
  success: "text-success",
};

/** The root, by layout. @internal */
const rootClass = {
  default: "@container/moment relative box-border flex w-full min-w-0 flex-col items-center gap-4 px-6 py-8 text-center text-balance",
  quiet: "relative box-border flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-start",
  inline: "relative box-border flex min-w-0 items-center gap-2 text-start",
} as const;

/**
 * The art's frame, by layout: up to 160px tall, 96px when the moment is narrower than 24rem,
 * 40px when quiet and 24px inline. The art fills the frame's height.
 *
 * @internal
 * @claim "The art's frame, by layout: up" registry/ouro/components/ouro/moment/moment.test.tsx verify:testExists(registry/ouro/components/ouro/moment/moment.test.tsx::Moment sizes > gives the art 160px, 96px in a pane narrower than 24rem, 40px quiet and 24px inline)
 */
const artFrameClass = {
  default: "relative grid h-(--ouro-moment-art) max-w-full shrink-0 place-items-center [--ouro-moment-art:10rem] @max-[24rem]/moment:[--ouro-moment-art:6rem]",
  quiet: "relative grid size-10 shrink-0 place-items-center",
  inline: "relative grid size-6 shrink-0 place-items-center",
} as const;

/**
 * The soft disc that swells out from behind the art when a moment celebrates; with reduced
 * motion it only fades.
 *
 * @internal
 */
const haloClass =
  "pointer-events-none absolute inset-0 m-auto aspect-square h-full max-w-full rounded-full bg-current opacity-0 " +
  "[transition:transform_var(--ouro-duration-sheet)_var(--ouro-ease-out),opacity_var(--ouro-duration-sheet)_var(--ouro-ease-out)] " +
  "starting:opacity-20 motion-safe:starting:[transform:scale(0.5)]";

/**
 * A small four-pointed spark that grows beside the art and fades; it stays inside the art's
 * frame, and it is hidden with reduced motion.
 *
 * @internal
 * @claim "A small four-pointed spark that grows" registry/ouro/components/ouro/moment/moment.test.tsx verify:testExists(registry/ouro/components/ouro/moment/moment.test.tsx::Moment > stays in the page's flow, and its celebration stays inside the art's frame)
 * @claim "A small four-pointed spark that grows" registry/ouro/components/ouro/moment/moment.test.tsx verify:testExists(registry/ouro/components/ouro/moment/moment.test.tsx::Moment motion > swells the disc and grows the sparks when it celebrates, and with reduced motion only fades the disc)
 */
const sparkleClass =
  "pointer-events-none absolute size-3 opacity-0 motion-reduce:hidden " +
  "[transition:transform_var(--ouro-duration-sheet)_var(--ouro-ease-out),opacity_var(--ouro-duration-slow)_ease_var(--ouro-duration-slow)] " +
  "starting:[transform:scale(0)] starting:opacity-100";

/** Where the sparks sit in the art's frame, and their tones. @internal */
const sparkles = [
  { at: "start-[8%] top-[14%]", tone: "text-primary" },
  { at: "end-[10%] top-[6%]", tone: "text-warning" },
  { at: "end-[4%] bottom-[22%]", tone: "text-success" },
  { at: "start-[16%] bottom-[8%]", tone: "text-primary" },
] as const;
