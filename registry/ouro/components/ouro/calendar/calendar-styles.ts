export {
  addDays,
  addMonths,
  calendarHint,
  dayClass,
  firstDayOfWeek,
  isIsoDate,
  isoWarning,
  monthGrid,
  monthStart,
  navClass,
  todayIso,
  weekdayHeaderClass,
};
export type { DateRange };

// Date math, value lists and class strings for Calendar and DatePicker, apart from the
// components so each component file exports only components (React Fast Refresh). Dates are
// ISO `YYYY-MM-DD` strings, the format a native date input submits; the math runs on UTC
// midnights, so a daylight saving change never shifts a day. Class strings are literal so the
// app's Tailwind finds them when it compiles.

/** A range of days, both ends included, as ISO dates (`"2026-10-11"`). */
interface DateRange {
  /** The first day. */
  start: string;
  /** The last day; the same as `start` for a one-day range. */
  end: string;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The UTC midnight of an ISO date. */
function toDate(iso: string): Date {
  const [, year, month, day] = ISO.exec(iso)!;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  return date;
}

/** The ISO date of a UTC midnight. */
function toIso(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Whether a value is a real ISO calendar date, `YYYY-MM-DD` (`"2026-02-30"` is not).
 *
 * @internal
 */
function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO.test(value) && toIso(toDate(value)) === value;
}

/**
 * The day `count` days after `iso` (before it when negative).
 *
 * @internal
 */
function addDays(iso: string, count: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + count);
  return toIso(date);
}

/**
 * The same day `count` months later, or that month's last day when it is shorter
 * (January 31 plus one month is February 28).
 *
 * @internal
 * @claim "The same day `count` months later" registry/ouro/components/ouro/calendar/calendar.test.tsx verify:testExists(registry/ouro/components/ouro/calendar/calendar.test.tsx::Calendar date math > checks ISO dates, adds months with clamping and lays out months)
 */
function addMonths(iso: string, count: number): string {
  const date = toDate(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  return toIso(date);
}

/**
 * The first day of the month `iso` is in.
 *
 * @internal
 */
function monthStart(iso: string): string {
  return `${iso.slice(0, 8)}01`;
}

/**
 * Today in the user's time zone, as an ISO date.
 *
 * @internal
 */
function todayIso(): string {
  const now = new Date();
  const date = new Date(0);
  date.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  return toIso(date);
}

// Where Intl.Locale has no week information (Firefox), the regions whose week starts on
// Sunday, Saturday or Friday, from CLDR's weekData; every other region starts on Monday.
const sundayRegions = new Set(
  "AG AS BD BR BS BT BW BZ CA CN CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW".split(" "),
);
const saturdayRegions = new Set("AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY".split(" "));
const fridayRegions = new Set(["MV"]);
/** The `-u-fw-` day keys, in `Date.getUTCDay()` order. */
const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** What Intl.Locale says about weeks, in browsers that have it. */
type WeekLocale = Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };

/**
 * The day a week starts on in a locale, as `Date.getUTCDay()` numbers it (0 is Sunday). It
 * honors a `-u-fw-` extension (`"en-US-u-fw-mon"`) where the browser does.
 *
 * @internal
 * @claim "The day a week starts on" registry/ouro/components/ouro/calendar/calendar.test.tsx verify:testExists(registry/ouro/components/ouro/calendar/calendar.test.tsx::Calendar > locale > takes the first day of the week from the locale)
 */
function firstDayOfWeek(locale: string): number {
  const intl = new Intl.Locale(locale) as WeekLocale;
  const info = intl.getWeekInfo?.() ?? intl.weekInfo;
  if (info) return info.firstDay % 7;
  // A `-u-fw-` extension names the day outright; without week information, read it here.
  const named = /-u(?:-[a-z0-9]{2,8})*?-fw-(sun|mon|tue|wed|thu|fri|sat)\b/i.exec(locale);
  if (named) return weekdayKeys.indexOf(named[1]!.toLowerCase());
  // Likely-subtags always add a region ("und" maximizes to en-Latn-US).
  const region = intl.maximize().region!;
  return sundayRegions.has(region) ? 0 : saturdayRegions.has(region) ? 6 : fridayRegions.has(region) ? 5 : 1;
}

/**
 * A month as weeks of seven ISO dates, starting on `firstDay`; days outside the month are
 * `null`.
 *
 * @internal
 */
function monthGrid(month: string, firstDay: number): Array<Array<string | null>> {
  const start = monthStart(month);
  const lead = (toDate(start).getUTCDay() - firstDay + 7) % 7;
  const days: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let day = start; day.slice(0, 7) === start.slice(0, 7); day = addDays(day, 1)) days.push(day);
  while (days.length % 7 !== 0) days.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return weeks;
}

/**
 * A day: 44px on a coarse pointer, 36px with a fine one. Selected days fill with the
 * primary color, the days between a range's ends take the accent, today is bold and
 * underlined, and unavailable days fade and strike through.
 *
 * @internal
 * @claim "A day: 44px on a coarse" registry/ouro/components/ouro/calendar/calendar.test.tsx verify:testExists(registry/ouro/components/ouro/calendar/calendar.test.tsx::Calendar > lets app layout classes win on the root, and gives days 36px with a fine pointer)
 * @claim "A day: 44px on a coarse" registry/ouro/components/ouro/calendar/calendar.touch.test.tsx verify:testExists(registry/ouro/components/ouro/calendar/calendar.touch.test.tsx::gives Calendar's days and month buttons 44px touch targets)
 */
const dayClass =
  "press relative m-0 box-border inline-flex size-11 items-center justify-center pointer-fine:size-9 " +
  "rounded-md border-0 bg-transparent p-0 font-[inherit] text-sm leading-none text-foreground tabular-nums " +
  "cursor-pointer select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "outline-ring outline-offset-2 focus-visible:z-1 focus-visible:outline-2 focus-visible:outline-solid " +
  "not-aria-disabled:not-data-selected:pointer-fine:hover:bg-accent not-aria-disabled:not-data-selected:pointer-fine:hover:text-accent-foreground " +
  "motion-safe:not-aria-disabled:active:scale-(--ouro-press-scale) " +
  "aria-[current=date]:font-semibold aria-[current=date]:underline aria-[current=date]:underline-offset-4 " +
  "data-in-range:bg-accent data-in-range:text-accent-foreground " +
  "data-selected:bg-primary data-selected:text-primary-foreground " +
  "aria-disabled:cursor-not-allowed aria-disabled:line-through aria-disabled:opacity-50";

/**
 * The previous and next month buttons: square, the size of a day.
 *
 * @internal
 */
const navClass = "aspect-square px-0";

/**
 * The weekday names over the columns.
 *
 * @internal
 */
const weekdayHeaderClass = "m-0 p-0 pb-1 text-xs leading-4 font-normal text-muted-foreground";

/**
 * The className hint: Calendar has no appearance props, so the fix is the theme.
 *
 * @internal
 */
function calendarHint(component: string): string {
  return `<${component} className="mt-4" />, and set colors in your theme's CSS variables`;
}

/**
 * The dev message for a date prop that is not an ISO date. Development only.
 *
 * @internal
 */
function isoWarning(component: string, prop: string, value: unknown): readonly [string, string] {
  return [`${prop}=${JSON.stringify(String(value))} is not an ISO date (YYYY-MM-DD)`, `<${component} ${prop}="2026-10-11">`];
}
