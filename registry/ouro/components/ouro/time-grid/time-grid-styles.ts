import { addDays, firstDayOfWeek, isIsoDate } from "@/registry/ouro/components/ouro/calendar/calendar-styles";

export {
  allDayClass,
  allDayLanes,
  backgroundBarClass,
  backgroundBarFillClass,
  backgroundFillClass,
  barStatusClass,
  dayLength,
  eventClass,
  eventHitClass,
  isIsoDate,
  layoutDay,
  lineCount,
  minuteClock,
  minVisibleMinutes,
  plainFillClass,
  slotSizes,
  statuses,
  statusClass,
  stepTo,
  timedClass,
  toInstant,
  toneBarClass,
  toneFillClass,
  toneSwatchClass,
  tones,
  viewDays,
  views,
  weekendDays,
  zonedClock,
};
export type { DayPlacement, LaneSpan, TimeGridStatus, TimeGridTone, TimeGridView, ZonedClock };

// Date math, layout and class strings for TimeGrid, apart from the component so its file exports
// only components (React Fast Refresh). Days are ISO dates (`"2026-03-12"`); a time of day is
// minutes from that day's midnight on the wall clock of the grid's time zone. Class strings are
// literal so the app's Tailwind finds them.

/** Which days the grid shows. */
type TimeGridView = "day" | "work-week" | "week";
const views: readonly TimeGridView[] = ["day", "work-week", "week"];

/** An event's colour: the theme's token names. */
type TimeGridTone = "primary" | "secondary" | "success" | "warning" | "destructive";
const tones: readonly TimeGridTone[] = ["primary", "secondary", "success", "warning", "destructive"];

/** What an event does to the person's time, which sets how it is drawn and read. */
type TimeGridStatus = "busy" | "tentative" | "free" | "unanswered" | "cancelled";
const statuses: readonly TimeGridStatus[] = ["busy", "tentative", "free", "unanswered", "cancelled"];

/** The lengths an empty slot can be, in minutes. */
const slotSizes: readonly number[] = [15, 30, 60];

/** Minutes in a day on the grid. */
const dayLength = 1440;

/**
 * The shortest an event is drawn, in minutes: room for one line of text. A shorter event still
 * takes this much room, so its text never runs into the next event.
 * @claim "so its text never runs" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid date and layout math > draws an event at least half an hour tall, never past midnight, and spreads it where its neighbours end)
 */
const minVisibleMinutes = 30;

/** An instant as a Date, or null when it is not one. */
function toInstant(value: Date | string | number): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Where instants fall on the grid's wall clock, in one time zone. */
interface ZonedClock {
  /** The day and the minutes from its midnight that an instant falls on. */
  at(instant: number): { day: string; minutes: number };
  /** The instant a day's wall-clock minute falls on. */
  instant(day: string, minutes: number): Date;
}

/** The wall clock of `timeZone` (an IANA name such as `"Europe/Berlin"`, or `undefined` for the reader's own). */
function zonedClock(timeZone: string | undefined): ZonedClock {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const at = (instant: number) => {
    const part: Record<string, string> = {};
    for (const { type, value } of format.formatToParts(instant)) part[type] = value;
    return { day: `${part.year}-${part.month}-${part.day}`, minutes: Number(part.hour) * 60 + Number(part.minute) };
  };
  const wall = (day: string, minutes: number) => Date.parse(`${day}T00:00:00Z`) + minutes * 60_000;
  return {
    at,
    instant(day, minutes) {
      // Read the wall time as UTC, then move by the zone's offset there; the second pass settles
      // an hour that a daylight saving change moves.
      const target = wall(day, minutes);
      let guess = target;
      // Stryker disable next-line EqualityOperator: a third pass lands where the second did
      for (let pass = 0; pass < 2; pass++) {
        const seen = at(guess);
        guess += target - wall(seen.day, seen.minutes);
      }
      return new Date(guess);
    },
  };
}

/** What Intl.Locale says about weeks, in browsers that have it. */
type WeekLocale = Intl.Locale & { getWeekInfo?: () => { weekend: number[] }; weekInfo?: { weekend: number[] } };

/**
 * The weekend in a locale, as `Date.getUTCDay()` numbers (0 is Sunday). Without week information
 * (Firefox), Friday and Saturday where the week starts on Saturday, and Saturday and Sunday elsewhere.
 * @claim "The weekend in a locale" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid date and layout math > finds the week's days from the locale, without its weekend for a work week)
 */
function weekendDays(locale: string): number[] {
  const intl = new Intl.Locale(locale) as WeekLocale;
  const info = intl.getWeekInfo?.() ?? intl.weekInfo;
  if (info) return info.weekend.map((day) => day % 7);
  return firstDayOfWeek(locale) === 6 ? [5, 6] : [6, 0];
}

/** The weekday of an ISO date, as `Date.getUTCDay()` numbers it. */
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** The days a view shows around `date`: the day, or its week from the locale's first day, without the weekend for `work-week`. */
function viewDays(date: string, view: TimeGridView, locale: string): string[] {
  if (view === "day") return [date];
  const start = addDays(date, -((weekday(date) - firstDayOfWeek(locale) + 7) % 7));
  const week = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  if (view === "week") return week;
  const weekend = weekendDays(locale);
  return week.filter((day) => !weekend.includes(weekday(day)));
}

/** A timed event's place in its day's column. */
interface DayPlacement<Key> {
  key: Key;
  /** The minutes from midnight it is drawn from, and to. */
  top: number;
  bottom: number;
  /** Its column in its group of overlapping events, how many columns it spreads over, and how many the group has. */
  column: number;
  span: number;
  columns: number;
}

/**
 * Lays out one day's timed events side by side where they overlap. Events that overlap one
 * another, directly or through others, share the day's width in columns: each takes the first
 * column free at its start, then spreads over the columns beside it that nothing it overlaps
 * uses. Events are drawn at least `minVisibleMinutes` tall, and overlap as drawn.
 * @claim "Lays out one day's" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid date and layout math > lays overlapping events side by side, spreading each over the columns free beside it)
 * @claim "Events that overlap one" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid date and layout math > lays overlapping events side by side, spreading each over the columns free beside it)
 */
function layoutDay<Key>(items: ReadonlyArray<{ key: Key; start: number; end: number }>): Array<DayPlacement<Key>> {
  const drawn = items
    .map(({ key, start, end }) => ({ key, top: start, bottom: Math.min(dayLength, Math.max(end, start + minVisibleMinutes)) }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const placed: Array<DayPlacement<Key>> = [];
  let group: Array<DayPlacement<Key>> = [];
  let groupEnd = 0;
  // Stryker disable next-line ArrayDeclaration: the first event closes an empty group, which empties it
  let ends: number[] = [];
  const close = () => {
    for (const item of group) {
      item.columns = ends.length;
      // An event to the right that starts as this one ends would have taken this one's column, so
      // `<` and `<=` read the same here.
      // Stryker disable next-line EqualityOperator: no event in a later column starts as this one ends
      const overlaps = (column: number) => group.some((other) => other.column === column && other.top < item.bottom && item.top < other.bottom);
      while (item.column + item.span < ends.length && !overlaps(item.column + item.span)) item.span++;
    }
    placed.push(...group);
    group = [];
    ends = [];
  };
  for (const item of drawn) {
    if (item.top >= groupEnd) close();
    let column = ends.findIndex((end) => end <= item.top);
    if (column === -1) column = ends.push(item.bottom) - 1;
    else ends[column] = item.bottom;
    group.push({ ...item, column, span: 1, columns: 1 });
    groupEnd = Math.max(groupEnd, item.bottom);
  }
  close();
  return placed;
}

/**
 * An all-day event's place in the all-day row.
 *
 * @claim "place in the all-day row" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid date and layout math > stacks all-day events in the first row free across their days)
 */
interface LaneSpan<Key> {
  key: Key;
  /** The first and last day it covers, as indexes into the days shown, and its row. */
  first: number;
  last: number;
  lane: number;
}

/**
 * Stacks all-day events in rows, each in the first row free across all the days it covers.
 *
 * @claim "Stacks all-day events in rows" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid date and layout math > stacks all-day events in the first row free across their days)
 */
function allDayLanes<Key>(items: ReadonlyArray<{ key: Key; first: number; last: number }>): Array<LaneSpan<Key>> {
  const lanes: number[] = [];
  return [...items]
    .sort((a, b) => a.first - b.first || b.last - a.last)
    .map((item) => {
      let lane = lanes.findIndex((last) => last < item.first);
      if (lane === -1) lane = lanes.push(item.last) - 1;
      else lanes[lane] = item.last;
      return { ...item, lane };
    });
}

/**
 * How many 16px lines of text fit in an event drawn `minutes` tall, at the grid's shortest hour (48px), less its padding.
 *
 * @claim "How many 16px lines" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid date and layout math > counts the lines an event's height holds)
 */
function lineCount(minutes: number): number {
  return Math.max(1, Math.floor(((minutes / 60) * 48 - 4) / 16));
}

/**
 * A clock the grids on a page share, moved on at each minute while any of them shows.
 *
 * @claim "A clock the grids" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid date and layout math > keeps one clock for every grid, moved on at each minute and stopped when the last one goes)
 */
function minuteClock(): { subscribe: (listener: () => void) => () => void; read: () => number } {
  let now = 0;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const untilNextMinute = () => 60_000 - (now % 60_000);
  const tick = () => {
    now = Date.now();
    timer = setTimeout(tick, untilNextMinute());
    for (const each of [...listeners]) each();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      now = Date.now();
      timer ??= setTimeout(tick, untilNextMinute());
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        clearTimeout(timer);
        timer = undefined;
      };
    },
    read: () => now,
  };
}

/**
 * Where an arrow key goes from the event `from`: Up and Down to the one before or after in time
 * order, Left and Right (swapped right to left) to the nearest in time on the day before or after
 * that has events, Home and End to the first and the last.
 */
function stepTo(pieces: ReadonlyArray<{ key: string; day: number; start: number }>, from: string, key: string, rtl: boolean): string | undefined {
  const index = pieces.findIndex((piece) => piece.key === from);
  const here = pieces[index]!;
  if (key === "ArrowDown") return pieces[index + 1]?.key;
  if (key === "ArrowUp") return pieces[index - 1]?.key;
  if (key === "Home") return pieces[0]!.key;
  if (key === "End") return pieces[pieces.length - 1]!.key;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return undefined;
  const forward = (key === "ArrowRight") !== rtl;
  const days = pieces.filter((piece) => (forward ? piece.day > here.day : piece.day < here.day));
  if (days.length === 0) return undefined;
  const day = forward ? days[0]!.day : days[days.length - 1]!.day;
  return pieces
    .filter((piece) => piece.day === day)
    .reduce((best, piece) => (Math.abs(piece.start - here.start) < Math.abs(best.start - here.start) ? piece : best)).key;
}

/**
 * An event: its text from the top, and a bar in its tone on its start edge (each status sets the
 * border widths, `statusClass`). Keyboard focus is a ring outside the event, with a gap, as on
 * Ouro's other controls; the selected event has a line just inside its edge instead, so focus on
 * it still shows. Under forced colours every event keeps a border.
 * @claim "Keyboard focus is a ring outside the event" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > draws keyboard focus apart from selection: a ring outside the event, where selection is a line just inside it)
 * @claim "each status sets the" registry/ouro/components/ouro/time-grid/time-grid-styles.ts verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid-styles.ts, /busy: "border-0 border-s-3"/)
 * @claim "Under forced colours every event" registry/ouro/components/ouro/time-grid/time-grid-styles.ts verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid-styles.ts, /forced-colors:border forced-colors:border-s-3/)
 */
const eventClass =
  "m-0 box-border flex min-w-0 flex-col rounded-md border-solid px-1.5 py-0.5 " +
  "font-[inherit] text-start text-xs leading-4 text-foreground no-underline [overflow-wrap:anywhere] " +
  "cursor-pointer select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "transition-colors duration-(--ouro-duration-fast) ease-(--ouro-ease-out) " +
  "outline-ring outline-offset-2 focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-solid " +
  "aria-[current=true]:z-20 aria-[current=true]:shadow-[inset_0_0_0_2px_var(--foreground)] " +
  "aria-expanded:z-20 aria-expanded:outline-2 aria-expanded:outline-solid aria-expanded:outline-primary " +
  "forced-colors:border forced-colors:border-s-3 forced-colors:aria-[current=true]:bg-[Highlight] forced-colors:aria-[current=true]:text-[HighlightText]";

/** A timed event fills its place in the day's column, over the now line. */
const timedClass = "absolute inset-0 z-10 scroll-mt-(--ouro-time-grid-head) @container/event";

/**
 * An all-day event: one line in the all-day row.
 *
 * @claim "one line in the" registry/ouro/components/ouro/time-grid/time-grid-styles.ts verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid-styles.ts, /allDayClass = "relative h-5\.5 w-full"/)
 */
const allDayClass = "relative h-5.5 w-full";

/**
 * Each tone's start bar, and the outline of a free or unanswered event.
 *
 * @claim "Each tone's start bar" registry/ouro/components/ouro/time-grid/time-grid-styles.ts verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid-styles.ts, /primary: "border-primary"/)
 */
const toneBarClass: Record<TimeGridTone, string> = {
  primary: "border-primary",
  secondary: "border-muted-foreground",
  success: "border-success",
  warning: "border-warning",
  destructive: "border-destructive",
};

/**
 * A busy event's fill: the tone over the page (`--ouro-time-grid-tint`, 14%, and 24% in dark mode,
 * where a tint shows less), opaque so the now line passes under the text, and stronger under a
 * mouse or a press.
 * @claim "A busy event's fill" registry/ouro/components/ouro/time-grid/time-grid.tsx verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid.tsx, /\[--ouro-time-grid-tint:14%\].*dark:\[--ouro-time-grid-tint:24%\]/)
 */
const toneFillClass: Record<TimeGridTone, string> = {
  primary:
    "bg-[color-mix(in_oklab,var(--primary)_var(--ouro-time-grid-tint),var(--background))] pointer-fine:hover:bg-[color-mix(in_oklab,var(--primary)_calc(var(--ouro-time-grid-tint)+8%),var(--background))] active:bg-[color-mix(in_oklab,var(--primary)_calc(var(--ouro-time-grid-tint)+12%),var(--background))]",
  secondary: "bg-secondary pointer-fine:hover:bg-[color-mix(in_oklab,var(--foreground)_8%,var(--secondary))] active:bg-[color-mix(in_oklab,var(--foreground)_12%,var(--secondary))]",
  success:
    "bg-[color-mix(in_oklab,var(--success)_var(--ouro-time-grid-tint),var(--background))] pointer-fine:hover:bg-[color-mix(in_oklab,var(--success)_calc(var(--ouro-time-grid-tint)+8%),var(--background))] active:bg-[color-mix(in_oklab,var(--success)_calc(var(--ouro-time-grid-tint)+12%),var(--background))]",
  warning:
    "bg-[color-mix(in_oklab,var(--warning)_var(--ouro-time-grid-tint),var(--background))] pointer-fine:hover:bg-[color-mix(in_oklab,var(--warning)_calc(var(--ouro-time-grid-tint)+8%),var(--background))] active:bg-[color-mix(in_oklab,var(--warning)_calc(var(--ouro-time-grid-tint)+12%),var(--background))]",
  destructive:
    "bg-[color-mix(in_oklab,var(--destructive)_var(--ouro-time-grid-tint),var(--background))] pointer-fine:hover:bg-[color-mix(in_oklab,var(--destructive)_calc(var(--ouro-time-grid-tint)+8%),var(--background))] active:bg-[color-mix(in_oklab,var(--destructive)_calc(var(--ouro-time-grid-tint)+12%),var(--background))]",
};

/**
 * The page-coloured fill of every status but busy.
 *
 * @claim "The page-coloured fill of" registry/ouro/components/ouro/time-grid/time-grid.tsx verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid.tsx, /status === "busy" \? toneFillClass\[tone\] : plainFillClass/)
 */
const plainFillClass = "bg-background pointer-fine:hover:bg-accent active:bg-accent";

/**
 * A background event's fill: a step off the page whatever its tone, so it reads as secondary
 * beside the person's own events; its tone is the bar on its start edge.
 * @claim "A background event's fill" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > draws background events in a lane at each day's start, beside the person's own)
 */
const backgroundFillClass =
  "bg-[color-mix(in_oklab,var(--foreground)_4%,var(--background))] pointer-fine:hover:bg-[color-mix(in_oklab,var(--foreground)_9%,var(--background))] active:bg-[color-mix(in_oklab,var(--foreground)_12%,var(--background))]";

/**
 * A background event in a week: a press target as wide as its share of the lane, with no text,
 * around a slim bar in its tone (`backgroundBarFillClass`) that widens under a mouse.
 * @claim "a press target as wide as" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > names a week's thin bars in a tooltip, and labels them in a day)
 */
const backgroundBarClass = "group/bar border-0 bg-transparent p-0";

/**
 * An event's hit area: at least 24px square to a mouse too, invisible, from its top start corner
 * toward the end and down, so a short event, an all-day one and a week's bar a few pixels wide are
 * easy to point at without being drawn bigger. It grows away from the events placed before it,
 * which therefore stay under the pointer where they show, and a background event's stays under
 * the person's own events.
 * @claim "An event's hit area" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > gives a week's thin bar a hit area at least 24px square to a mouse from its top corner, without growing the bar)
 * @claim "An event's hit area" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > gives a short event and an all-day one a hit area at least 24px tall, without drawing them taller)
 */
const eventHitClass = "absolute top-0 start-0 size-[max(100%,1.5rem)]";

/**
 * The slim bar a week draws for a background event: 4px, and 6px under a mouse or while its popover is open, with no motion.
 *
 * @claim "The slim bar a week draws" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > names a week's thin bars in a tooltip, and labels them in a day)
 */
const backgroundBarFillClass =
  "pointer-events-none absolute inset-y-0 start-0.5 box-border w-1 rounded-full border-solid pointer-fine:group-hover/bar:w-1.5 group-aria-expanded/bar:w-1.5";

/**
 * Each tone as a solid swatch, the bar's colour: mixed toward the page so a column of bars stays quiet.
 *
 * @claim "Each tone as a solid swatch" registry/ouro/components/ouro/time-grid/time-grid-styles.ts verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid-styles.ts, /primary: "border-primary bg-\[color-mix/)
 */
const toneSwatchClass: Record<TimeGridTone, string> = {
  primary: "border-primary bg-[color-mix(in_oklab,var(--primary)_60%,var(--background))]",
  secondary: "border-muted-foreground bg-[color-mix(in_oklab,var(--muted-foreground)_60%,var(--background))]",
  success: "border-success bg-[color-mix(in_oklab,var(--success)_60%,var(--background))]",
  warning: "border-warning bg-[color-mix(in_oklab,var(--warning)_60%,var(--background))]",
  destructive: "border-destructive bg-[color-mix(in_oklab,var(--destructive)_60%,var(--background))]",
};

/**
 * A bar's status: busy is filled; every other status is an outline in the tone, dashed for an
 * answer still owed and dotted when cancelled. Under forced colours a filled bar is the text colour.
 * @claim "every other status is an outline" registry/ouro/components/ouro/time-grid/time-grid-styles.ts verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid-styles.ts, /unanswered: "border bg-transparent border-dashed"/)
 */
const barStatusClass: Record<TimeGridStatus, string> = {
  busy: "border-0 forced-colors:bg-[CanvasText]",
  tentative: "border bg-transparent",
  free: "border bg-transparent",
  unanswered: "border bg-transparent border-dashed",
  cancelled: "border bg-transparent border-dotted",
};

/**
 * What each status adds. Tentative is hatched, with a dashed bar; free is outlined; an event
 * that needs an answer is outlined in dashes; a cancelled one has a dotted bar and is struck
 * through in muted text. The dashes and dots stay under forced colours.
 * @claim "What each status adds" registry/ouro/components/ouro/time-grid/time-grid-styles.ts verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid-styles.ts, /unanswered: "border border-s-3 border-dashed"/)
 */
const statusClass: Record<TimeGridStatus, string> = {
  busy: "border-0 border-s-3",
  tentative:
    "border-0 border-s-3 [border-inline-start-style:dashed] forced-colors:[border-inline-start-style:dashed] [background-image:repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_oklab,currentColor_7%,transparent)_5px_10px)]",
  free: "border border-s-3",
  unanswered: "border border-s-3 border-dashed",
  cancelled: "border-0 border-s-3 [border-inline-start-style:dotted] forced-colors:[border-inline-start-style:dotted] text-[color-mix(in_oklab,var(--muted-foreground)_55%,var(--foreground))] line-through",
};
