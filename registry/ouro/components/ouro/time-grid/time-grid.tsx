"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Menu, MenuItem } from "@/registry/ouro/components/ouro/menu/menu";
import { ScrollArea } from "@/registry/ouro/components/ouro/scroll-area/scroll-area";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { RouterLink } from "@/registry/ouro/lib/ouro/router-link";
import { renamedTones } from "@/registry/ouro/lib/ouro/tones";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useDevWarnings, type DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { addDays } from "@/registry/ouro/components/ouro/calendar/calendar-styles";
import { inBrowser, onServer, subscribeNever } from "@/registry/ouro/components/ouro/local-date/local-date-styles";
import {
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
  stepTo,
  plainFillClass,
  slotSizes,
  stackMinWidth,
  stacksOf,
  statusClass,
  statuses,
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
  type DayPlacement,
  type TimeGridStatus,
  type TimeGridTone,
  type TimeGridView,
} from "@/registry/ouro/components/ouro/time-grid/time-grid-styles";

export type { TimeGridStatus, TimeGridTone, TimeGridView };

/** One event on a {@link TimeGrid}. */
export interface TimeGridEvent {
  /** Unique among the grid's events. `onEventSelect` gets the event back, and `selectedId` names it. */
  id: string;
  /** What the event is, shown first and read first: `"Design review"`. */
  title: string;
  /**
   * When it starts: a `Date`, an ISO string or a timestamp in milliseconds. A calendar date with
   * no time (`"2026-03-12"`) makes the event all day, on that day for every reader, in the
   * all-day row.
   * @claim "makes the event all day" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > puts all-day events in their own row, across the days they cover)
   */
  start: Date | string | number;
  /**
   * When it ends. A timed event needs one. An all-day event's `end` is its last day, included
   * (`"2026-03-14"` for three days from the 12th); without it the event is one day. A timed event
   * 24 hours or longer goes in the all-day row across the days it covers.
   * @claim "is its last day" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > puts all-day events in their own row, across the days they cover)
   * @claim "24 hours or longer" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > puts a timed event of a day or more in the all-day row, and cuts one across midnight into each day)
   */
  end?: Date | string | number | undefined;
  /** A second line where there is room: a place, a room, who organised it. Screen readers hear it last. */
  description?: string | undefined;
  /** Its colour, from your theme. @default "primary" */
  tone?: TimeGridTone | (string & { 'danger is "destructive"; accent is "primary"; neutral is "secondary"': never }) | undefined;
  /**
   * What it does to the person's time. `busy` is filled; `tentative` is hatched; `free` is
   * outlined; `unanswered`, an invitation still waiting for an answer, is outlined in dashes;
   * `cancelled` is struck through. Screen readers hear every status but busy, in the words of
   * `statusLabels`.
   * @default "busy"
   * @claim "Screen readers hear every" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > names each event by the words it shows first, its title and its time, then its day, its status and its description)
   */
  status?: TimeGridStatus | (string & { 'Use "busy", "tentative", "free", "unanswered" or "cancelled"': never }) | undefined;
  /** Makes the event a link to its page, through `OuroProvider`'s router link for a path in your app. */
  href?: string | undefined;

  /**
   * Not a field. An all-day event's `start` is a date: `{ start: "2026-03-12" }`.
   *
   * @claim "An all-day event's `start` is a date" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > development messages > names what is wrong with an event, and draws it in the defaults)
   */
  allDay?: { 'Pass start as a date: start: "2026-03-12"': never };
  /** Not a field. Colours come from the theme: `{ tone: "success" }`. */
  color?: { 'Use tone: "success"': never };
}

/** What {@link TimeGrid}'s `onEventSelect` gets besides the event. */
export interface TimeGridSelectDetails {
  /** The event's element, to anchor a popover of your own to (`<Popover anchor={ref}>`). */
  element: HTMLElement;
  /** Whether it is one of `backgroundEvents`. */
  background: boolean;
}

/** An empty stretch of time someone pressed, from {@link TimeGrid}'s `onSlotSelect`. */
export interface TimeGridSlot {
  start: Date;
  end: Date;
}

/**
 * The words screen readers hear for each status but busy.
 *
 * @claim "The words screen readers hear for each status but busy" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > speaks the statuses in the words given)
 */
export type TimeGridStatusLabels = Partial<Record<Exclude<TimeGridStatus, "busy">, string>>;

/** The props TimeGrid adds to the div attributes it passes through. */
export interface TimeGridOwnProps {
  /**
   * What the grid shows, read by screen readers as its name: `"Team calendar"`. Required,
   * because a scrolling page of hours says nothing on its own. It is not shown.
   */
  label: string;
  /**
   * The events. Each shows on every day it covers that the grid shows; the rest are left out.
   *
   * @claim "Each shows on every day" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > puts a timed event of a day or more in the all-day row, and cuts one across midnight into each day)
   */
  events: readonly TimeGridEvent[];
  /**
   * The day to show, as an ISO date (`"2026-03-12"`). `week` and `work-week` show the week it is
   * in. Move it with your own Today, Previous and Next buttons.
   */
  date: string;
  /**
   * `day`, `work-week` (the week without the locale's weekend) or `week`, from the locale's
   * first day of the week.
   * @default "week"
   */
  view?: TimeGridView | (string & { 'Use "day", "work-week" or "week"': never }) | undefined;
  /**
   * The IANA time zone the grid's clock reads (`"Europe/Berlin"`): which day and hour each
   * event falls on, where the now line is, and the times shown. Without it, the reader's own,
   * once the page runs in the browser; the server writes UTC until then.
   * @claim "The IANA time zone" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > places each event by its times on the grid's clock, and moves it with the time zone)
   */
  timeZone?: string | undefined;
  /**
   * The BCP 47 locale for the day names, the hours (`"9 AM"`, `"09"`), the times and the first
   * day of the week: `"en-GB"` starts weeks on Monday. The default is the same on the server and
   * in the browser, so hydration matches.
   * @default "en-US"
   * @claim "The BCP 47 locale" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > writes day names, hours and times in the locale)
   */
  locale?: string | undefined;
  /**
   * The current time, when your app keeps the clock (a demo, a test, a time it shares with
   * other views). Without it, the grid reads the browser's clock and moves the now line each
   * minute.
   * @claim "the grid reads the" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > follows the browser's clock without now, moving the line each minute)
   */
  now?: Date | string | number | undefined;
  /**
   * The working day, in hours from midnight (`{ start: 8.5, end: 17 }`). The hours outside it,
   * and weekend days, are shaded, and the grid opens scrolled to its start unless today is
   * shown, when it opens at now, or at today's first event when now is before it.
   * @default { start: 8, end: 17 }
   * @claim "start: 8, end: 17" registry/ouro/components/ouro/time-grid/time-grid.tsx verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid.tsx, /const defaultWorkingHours = \{ start: 8, end: 17 \}/)
   */
  workingHours?: { start: number; end: number } | undefined;
  /** The selected event's id: it gets an outline and `aria-current`. */
  selectedId?: string | null | undefined;
  /**
   * Called with the event when someone presses it, or presses Enter on it, and with its element
   * and whether it is a background event, so a popover of your own can point at it.
   * @claim "and with its element" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > tells onEventSelect which element was pressed, and marks the one whose popover is open)
   */
  onEventSelect?: ((event: TimeGridEvent, details: TimeGridSelectDetails) => void) | undefined;
  /**
   * Events that are not the person's own, such as a shared calendar, a colleague's or a room's.
   * Each day draws them in a lane of their own at its start, beside the person's events: thin
   * bars that name themselves in a tooltip in a week, and labelled ones in a day. Each is a
   * button that `onEventSelect` gets, reached with the arrow keys like the others. Timed events
   * only: those that are all day, or 24 hours or longer, are left out.
   * @claim "Each day draws them in a lane" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > draws background events in a lane at each day's start, beside the person's own)
   * @claim "thin bars that name themselves" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > names a week's thin bars in a tooltip, and labels them in a day)
   * @claim "reached with the arrow keys" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > takes the arrow keys through background events in time order with the rest)
   * @claim "those that are all day" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > development messages > names a background event that is all day, and leaves it out)
   */
  backgroundEvents?: readonly TimeGridEvent[] | undefined;
  /**
   * What the background events are, heard after each one's title, time and day, and as the name
   * of each day's lane: `"Shared calendar"`. Translate it with your app.
   * @default "Other calendars"
   * @claim "heard after each one's title, time and day" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > draws background events in a lane at each day's start, beside the person's own)
   */
  backgroundLabel?: string | undefined;
  /**
   * The words on a stack of a day's background events drawn as one: in a day too narrow to label
   * each of them, overlapping background events show as one block with their count, which opens
   * their list. Translate it with your app.
   * @default (count) => `${count} events`
   * @claim "overlapping background events show as one block" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > draws a day's background events too narrow to read as one count that opens their list)
   */
  stackLabel?: ((count: number) => string) | undefined;
  /**
   * The id of the event whose popover of your own is open: it says so to screen readers
   * (`aria-expanded`) and gets an outline until you clear it.
   * @claim "it says so to screen readers" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > tells onEventSelect which element was pressed, and marks the one whose popover is open)
   */
  expandedId?: string | null | undefined;
  /**
   * Content of your own under each day's header, such as a count or a load bar. It gets the day
   * as an ISO date. Screen readers read it, so give a bar words of its own.
   * @claim "Content of your own under each day's header" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > puts the app's summary under each day's header, where screen readers read it)
   */
  renderDaySummary?: ((day: string) => ReactNode) | undefined;
  /**
   * Called when someone presses an empty part of a day, with the slot under the pointer, for a
   * new event there. A mouse shows the slot before the press. Slots answer a pointer only, so
   * give keyboards a New event button of your own as well.
   */
  onSlotSelect?: ((slot: TimeGridSlot) => void) | undefined;
  /**
   * How long a slot `onSlotSelect` gets is, in minutes: 15, 30 or 60. @default 30
   *
   * @claim "How long a slot" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > presses an empty slot with onSlotSelect, and shows a mouse the slot first)
   */
  slotMinutes?: 15 | 30 | 60 | (number & { "Use 15, 30 or 60": never }) | undefined;
  /**
   * The all-day row's name, shown beside it and heard in each all-day event's name. Translate it with your app. @default "All day"
   *
   * @claim "The all-day row's name" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > writes day names, hours and times in the locale)
   */
  allDayLabel?: string | undefined;
  /**
   * The words screen readers hear for each status, after the event's title. Translate them with
   * your app.
   * @default { tentative: "tentative", free: "free", unanswered: "needs your answer", cancelled: "cancelled" }
   * @claim "The words screen readers hear for each status, after" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > speaks the statuses in the words given)
   */
  statusLabels?: TimeGridStatusLabels | undefined;
  /** Something small drawn where the now line meets the hours: a mascot, an avatar. Decoration only; screen readers skip it. */
  nowAdornment?: ReactNode;
  /**
   * Layout only: the grid's height (`h-full`, `h-[40rem]`), width and margins. Appearance classes
   * warn in development. In a grid taller than a day, the hours grow so the day ends at its foot.
   * @claim "In a grid taller than a day, the hours grow" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > grows its hours to fill a grid taller than a day, so the day ends at the grid's foot, and shrinks them back with it)
   */
  className?: string | undefined;
  /** The grid's root element. */
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The view is `view`: `<TimeGrid view="work-week">`, which your app keeps. */
  defaultView?: { 'Use view="work-week"': never };
  /** Not a prop. The day is `date`, which your app keeps: `<TimeGrid date="2026-03-12">`. */
  defaultDate?: { 'Use date="2026-03-12"': never };
  /** Not a prop. Ouro UI uses `onEventSelect`, which gets the event. */
  onSelectEvent?: { "Use onEventSelect={(event) => open(event.id)}": never };
  /** Not a prop. Ouro UI uses `onSlotSelect`, which gets `{ start, end }`. */
  onSelectSlot?: { "Use onSlotSelect={({ start, end }) => create(start, end)}": never };
  /** Not a prop. The grid opens at the start of `workingHours`, or at now when today shows. */
  scrollToTime?: { "Use workingHours={{ start: 8, end: 17 }}": never };
}

/** Props for {@link TimeGrid}: its own props and the div attributes it passes through to the root. */
export type TimeGridProps = Omit<HTMLAttributes<HTMLDivElement>, keyof TimeGridOwnProps> & TimeGridOwnProps;

// Busy, the usual, goes unsaid.
const defaultStatusLabels: Record<TimeGridStatus, string> = { busy: "", tentative: "tentative", free: "free", unanswered: "needs your answer", cancelled: "cancelled" };
/** `value` when it is one of `list`, else `fallback`. */
const oneOf = <Name extends string>(list: readonly Name[], value: string | undefined, fallback: Name): Name => ((list as readonly (string | undefined)[]).includes(value) ? (value as Name) : fallback);
const defaultWorkingHours = { start: 8, end: 17 };

const clock = minuteClock();
// Stryker disable next-line ArrowFunction: the server's time only has to be no time, which 0 and undefined both are
const serverNow = () => 0;

// An event's time and description: muted text mixed toward the foreground, further than on a
// plain muted surface, because a dark theme colour tints the fill under it.
const mutedClass = "text-[color-mix(in_oklab,var(--muted-foreground)_55%,var(--foreground))]";
const mutedLineClass = "truncate text-[color-mix(in_oklab,var(--muted-foreground)_55%,var(--foreground))]";

/**
 * One drawn piece of an event: a timed event has one per day it covers; an all-day event, one.
 *
 * @claim "One drawn piece of" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > puts a timed event of a day or more in the all-day row, and cuts one across midnight into each day)
 */
interface Piece {
  key: string;
  event: TimeGridEvent;
  /** The index of its (first) day among those shown. */
  day: number;
  /**
   * Minutes from that day's midnight it starts and ends; for an all-day event, -1 (so it comes first) to the day's end.
   *
   * @claim "Minutes from that day's" registry/ouro/components/ouro/time-grid/time-grid.tsx verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid.tsx, /start: -1, end: dayLength/)
   */
  start: number;
  end: number;
  /** What a screen reader hears after its title and time: its day or days. */
  when: string[];
  /** Its status, `busy` for one the grid does not know. */
  status: TimeGridStatus;
  /** Whether it is one of `backgroundEvents`. */
  background: boolean;
}

const utcDate = (day: string) => new Date(`${day}T00:00:00Z`);
const between = (low: number, value: number, high: number) => Math.min(high, Math.max(low, value));
/** A length in minutes as a share of the grid's hour height. */
const minutesTall = (minutes: number) => `calc(var(--ouro-time-grid-hour) * ${minutes / 60})`;

/**
 * A day, work week or week of hours, with events placed by their times: the calendar grid of
 * a mail or meeting app. Each day has a column under a header, today's marked; all-day events
 * have a row of their own; hours run down the side in the locale's words. Events that overlap sit side by
 * side, each a button (a link with `href`) that shows its title first and is named for screen
 * readers by the words it shows, in their order, then its day and its status ("Design review,
 * 9:00 – 10:00 AM, Thursday, needs your answer"). The grid is one Tab stop: the arrow keys move through events in time
 * order (Up and Down) and across days (Left and Right), Home and End go to the first and the
 * last, and Enter opens one. It opens scrolled to now or to the working day (to today's first
 * event when now is before it), and a now line
 * runs across today, under events so it never crosses their text.
 *
 * Use `Calendar` instead to pick a date from a month, and `Table` or `ItemGroup` for an agenda
 * list of events.
 *
 * @group Data
 * @see https://ui.ouro.bot/docs/time-grid
 *
 * @example
 * <TimeGrid
 *   label="Team calendar"
 *   date="2026-03-12"
 *   view="work-week"
 *   events={[{ id: "1", title: "Design review", start: "2026-03-12T09:00:00Z", end: "2026-03-12T10:00:00Z", status: "unanswered" }]}
 *   onEventSelect={(event) => open(event.id)}
 *   className="h-[40rem]"
 * />
 * @claim "Each day has a column" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > draws a week of days from the locale's first day, each a list named by its date, today marked)
 * @claim "Events that overlap sit side" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > shares a day's width between overlapping events)
 * @claim "It opens scrolled to now" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > runs the now line across today, under the events, with the time beside it)
 * @claim "It opens scrolled to now" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > opens at today's first event when now is before it, rather than at empty hours before now)
 */
export function TimeGrid(props: TimeGridProps): JSX.Element {
  const {
    label,
    events,
    date,
    view: viewProp = "week",
    timeZone,
    locale = "en-US",
    now: nowProp,
    workingHours: workingHoursProp,
    selectedId,
    onEventSelect,
    backgroundEvents = [],
    backgroundLabel = "Other calendars",
    stackLabel = (count: number) => `${count} events`,
    expandedId,
    renderDaySummary,
    onSlotSelect,
    slotMinutes: slotProp = 30,
    allDayLabel = "All day",
    statusLabels,
    nowAdornment,
    className,
    ref,
    style,
    onKeyDown: onKeyDownProp,
    // Guard props (hint types), dropped here so they never reach the DOM.
    defaultView,
    defaultDate,
    onSelectEvent,
    onSelectSlot,
    scrollToTime,
    ...rest
  } = props;
  const view = oneOf(views, viewProp, "week");
  const slotMinutes = slotSizes.includes(slotProp) ? slotProp : 30;
  const workingHours =
    workingHoursProp && workingHoursProp.start >= 0 && workingHoursProp.end <= 24 && workingHoursProp.start < workingHoursProp.end ? workingHoursProp : defaultWorkingHours;
  const nowGiven = toInstant(nowProp ?? Number.NaN);

  // The reader's time zone and clock are the browser's: the server and hydration write UTC with
  // no now, so the markup matches wherever the server runs; the browser then fills them in.
  const hydrated = useSyncExternalStore(subscribeNever, inBrowser, onServer);
  const ticking = useSyncExternalStore(nowGiven ? subscribeNever : clock.subscribe, clock.read, serverNow);
  const nowTime = nowGiven ? nowGiven.getTime() : ticking;
  const zone = timeZone ?? (hydrated ? undefined : "UTC");

  const days = useMemo(() => (isIsoDate(date) ? viewDays(date, view, locale) : []), [date, view, locale]);
  const weekend = weekendDays(locale);
  const formats = useMemo(
    () => ({
      clock: zonedClock(zone),
      hour: new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }),
      time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: zone }),
      acrossDays: new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone }),
      weekdayShort: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }),
      weekdayLong: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }),
      dayNumber: new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }),
      fullDay: new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }),
    }),
    [zone, locale],
  );
  const nowAt = nowTime > 0 ? formats.clock.at(nowTime) : null;
  const todayIndex = nowAt ? days.indexOf(nowAt.day) : -1;

  // The events cut into what each shown day draws, in the order the arrow keys take them.
  const words = { ...defaultStatusLabels, ...statusLabels };
  const problems: DevWarning[] = [];
  const pieces: Piece[] = [];
  const allDaySpans: Array<{ key: string; first: number; last: number }> = [];
  const timedItems: Array<Array<{ key: string; start: number; end: number }>> = days.map(() => []);
  // Two times of day. Across midnight Intl would add both dates, so the times are joined instead.
  const rangeText = (format: Intl.DateTimeFormat, start: Date, end: Date) =>
    formats.clock.at(start.getTime()).day === formats.clock.at(end.getTime()).day ? format.formatRange(start, end) : `${format.format(start)} – ${format.format(end)}`;
  // An all-day event's days: its weekday, or the dates it runs between.
  const daysText = (first: string, last: string) => (first === last ? formats.weekdayLong.format(utcDate(first)) : formats.fullDay.formatRange(utcDate(first), utcDate(last)));
  // The shown days from `from` to `to`, as indexes, or null when none of them shows.
  const spanOf = (from: string, to: string) => {
    const first = days.findIndex((day) => day >= from);
    const last = days.findLastIndex((day) => day <= to);
    return first === -1 || first > last ? null : { first, last };
  };
  const backgroundItems: Array<Array<{ key: string; start: number; end: number }>> = days.map(() => []);
  const place = (list: readonly TimeGridEvent[], background: boolean) => {
    const seen = new Set<string>();
    const prefix = background ? "bg:" : "";
    for (const [index, event] of list.entries()) {
      // A repeated id still gets keys of its own, so React keeps every event.
      const id = seen.has(event.id) ? `${event.id}#${index}` : event.id;
      const status = oneOf(statuses, event.status, "busy");
      if (process.env.NODE_ENV !== "production" && id !== event.id) problems.push([`two ${background ? "background events" : "events"} have id "${event.id}"`, "give each event its own id"]);
      seen.add(event.id);
      if (isIsoDate(event.start)) {
        if (background) {
          /* istanbul ignore else @preserve -- the else path exists only in production bundles */
          if (process.env.NODE_ENV !== "production") problems.push([`background event "${event.id}" is all day, and background events are timed`, "pass it in events, or give it a start and end time"]);
          continue;
        }
        const startsOn = event.start;
        // Stryker disable next-line EqualityOperator: an end on the start day is the start day either way
        const endsOn = isIsoDate(event.end) && event.end > startsOn ? event.end : startsOn;
        const span = spanOf(startsOn, endsOn);
        if (!span) continue;
        const key = `all:${id}`;
        pieces.push({ key, event, status, background, day: span.first, start: -1, end: dayLength, when: [daysText(startsOn, endsOn), allDayLabel] });
        allDaySpans.push({ key, ...span });
        continue;
      }
      const start = toInstant(event.start);
      const end = toInstant(event.end ?? Number.NaN);
      /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
      if (process.env.NODE_ENV !== "production") {
        if (!start) problems.push([`event "${event.id}" has start=${JSON.stringify(event.start)}, which is not a date`, '{ start: "2026-03-12T09:00:00Z" }, or start: "2026-03-12" for all day']);
        else if (!end) problems.push([`event "${event.id}" has no end`, '{ start, end: "2026-03-12T10:00:00Z" }']);
        else if (end < start) problems.push([`event "${event.id}" ends before it starts`, "{ start, end } with end after start"]);
      }
      if (!start || !end || end < start) continue;
      const from = formats.clock.at(start.getTime());
      const to = formats.clock.at(end.getTime());
      // An event that ends at midnight ends on the day before.
      const lastDay = to.minutes === 0 && end > start ? addDays(to.day, -1) : to.day;
      // A day or more of time goes in the all-day row, across the days it covers; whole days from
      // midnight read as all-day events do.
      if (end.getTime() - start.getTime() >= dayLength * 60_000) {
        if (background) {
          /* istanbul ignore else @preserve -- the else path exists only in production bundles */
          if (process.env.NODE_ENV !== "production") problems.push([`background event "${event.id}" lasts a day or more, and background events are shorter`, "pass it in events, or give it a start and end time"]);
          continue;
        }
        const span = spanOf(from.day, lastDay);
        if (!span) continue;
        const key = `all:${id}`;
        const when = from.minutes === 0 && to.minutes === 0 ? [daysText(from.day, lastDay), allDayLabel] : [formats.acrossDays.formatRange(start, end)];
        pieces.push({ key, event, status, background, day: span.first, start: -1, end: dayLength, when });
        allDaySpans.push({ key, ...span });
        continue;
      }
      // The time itself is heard as the event shows it, right after its title.
      const when = from.day === lastDay ? [formats.weekdayLong.format(utcDate(from.day))] : [formats.acrossDays.formatRange(start, end)];
      days.forEach((day, column) => {
        if (day < from.day || day > lastDay) return;
        const key = `${prefix}${column}:${id}`;
        const top = day === from.day ? from.minutes : 0;
        const bottom = day === to.day ? to.minutes : dayLength;
        pieces.push({ key, event, status, background, day: column, start: top, end: bottom, when });
        (background ? backgroundItems : timedItems)[column]!.push({ key, start: top, end: bottom });
      });
    }
  };
  place(events, false);
  place(backgroundEvents, true);
  // A background event comes after the person's own that start with it.
  pieces.sort((a, b) => a.day - b.day || a.start - b.start || Number(a.background) - Number(b.background) || b.end - a.end);
  const allDay = allDayLanes(allDaySpans);
  const timed = timedItems.map((items) => layoutDay(items));
  const behind = backgroundItems.map((items) => layoutDay(items));
  const hasBackground = backgroundItems.some((items) => items.length > 0);

  useAppearanceClassNameCheck(
    "TimeGrid",
    className,
    process.env.NODE_ENV !== "production"
      ? '<TimeGrid className="h-[40rem]" />, and set colors in your theme\'s CSS variables, or tone on an event'
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "TimeGrid",
    process.env.NODE_ENV !== "production"
      ? () => [
          !label && ["label is required; it names the grid for screen readers", '<TimeGrid label="Team calendar">'],
          !isIsoDate(date) && [`date=${JSON.stringify(String(date))} is not an ISO date (YYYY-MM-DD)`, '<TimeGrid date="2026-03-12">'],
          !(views as readonly string[]).includes(viewProp) && [`view="${String(viewProp)}" is not a view; use "day", "work-week" or "week"`, '<TimeGrid view="week">'],
          nowProp !== undefined && !nowGiven && [`now=${JSON.stringify(nowProp)} is not a date`, "<TimeGrid now={new Date()}>, or leave it out to follow the clock"],
          workingHoursProp !== undefined && workingHours !== workingHoursProp && [
            `workingHours=${JSON.stringify(workingHoursProp)} is not a working day; start and end are hours from 0 to 24, start first`,
            "<TimeGrid workingHours={{ start: 8, end: 17 }}>",
          ],
          slotMinutes !== slotProp && [`slotMinutes={${String(slotProp)}} is not a slot length; use 15, 30 or 60`, "<TimeGrid slotMinutes={30}>"],
          ...problems,
          ...[...events, ...backgroundEvents].flatMap((event): DevWarning[] => [
            event.tone !== undefined && !(tones as readonly string[]).includes(event.tone) && [
              `event "${event.id}": tone="${String(event.tone)}" is not a tone; use "primary", "secondary", "success", "warning" or "destructive"`,
              `{ tone: "${Object.hasOwn(renamedTones, event.tone) ? renamedTones[event.tone] : "primary"}" }`,
            ],
            event.status !== undefined && !(statuses as readonly string[]).includes(event.status) && [
              `event "${event.id}": status="${String(event.status)}" is not a status; use "busy", "tentative", "free", "unanswered" or "cancelled"`,
              '{ status: "tentative" }',
            ],
            event.allDay !== undefined && [`event "${event.id}": allDay is not a field; an all-day event's start is a date`, '{ start: "2026-03-12" }'],
            event.color !== undefined && [`event "${event.id}": color is not a field; colours come from the theme`, '{ tone: "success" }'],
          ]),
          defaultView !== undefined && ["defaultView is not a prop; the app keeps the view", '<TimeGrid view="work-week">'],
          defaultDate !== undefined && ["defaultDate is not a prop; the app keeps the date", '<TimeGrid date="2026-03-12">'],
          onSelectEvent !== undefined && ["onSelectEvent is not a prop", "<TimeGrid onEventSelect={(event) => open(event.id)}>"],
          onSelectSlot !== undefined && ["onSelectSlot is not a prop", "<TimeGrid onSlotSelect={({ start, end }) => create(start, end)}>"],
          scrollToTime !== undefined && ["scrollToTime is not a prop; the grid opens at now or at the working day's start", "<TimeGrid workingHours={{ start: 8, end: 17 }}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // A week's background events are bars too thin for text; a day has room to label them.
  const labelBackground = view === "day";
  // In a day, a stack of background events too narrow to label each is drawn as one count that
  // opens their list. It needs the lane's width, which only a measure knows; server HTML, and
  // the first render before it, draw each event.
  const [laneWidth, setLaneWidth] = useState(0);
  const stacks = behind.map((placements) =>
    // Stryker disable next-line ConditionalExpression,EqualityOperator: an unmeasured lane is measured before the first paint, which decides either way.
    labelBackground && laneWidth > 0
      ? // Stryker disable next-line ConditionalExpression,EqualityOperator: a lone event spans the whole lane, at least 7rem, so it is never too narrow; one exactly at the minimum reads either way.
        stacksOf(placements).filter((stack) => stack.length > 1 && stack.some((placed) => (laneWidth * placed.span) / placed.columns < stackMinWidth))
      : [],
  );
  // Each folded event's stack, by its key; the stack goes by its first event's key.
  const stackOf = new Map(stacks.flat().flatMap((stack) => stack.map((placed) => [placed.key, stack] as const)));
  const reachable = pieces.filter((piece) => (stackOf.get(piece.key)?.[0]!.key ?? piece.key) === piece.key);

  // The event with the Tab stop: the last one moved to, else the selected one, else the first.
  const [active, setActive] = useState<string | null>(null);
  const stopFor = (key: string | undefined) => (key === undefined ? undefined : (stackOf.get(key)?.[0]!.key ?? key));
  const tabStop = stopFor(pieces.find((piece) => piece.key === active)?.key ?? pieces.find((piece) => piece.event.id === selectedId)?.key ?? pieces[0]?.key);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRoot = (element: HTMLDivElement | null) => {
    rootRef.current = element;
    if (typeof ref === "function") return ref(element);
    if (ref) ref.current = element;
  };

  // Open at now when today shows, else half an hour before the working day: once for each set
  // of days, and again when today moves (the browser first knows the time, or midnight passes).
  // Before today's first event, open at it instead, as at the working day, so the grid does not
  // open on empty hours before now; now stays in view when the event is close.
  const scrollKey = `${days[0]}:${days.length}:${todayIndex}`;
  // Where today's first event starts, in minutes, or -1 with none today, which is never after now.
  const firstToday = todayIndex >= 0 && timed[todayIndex]!.length > 0 ? Math.min(...timed[todayIndex]!.map((placed) => placed.top)) : -1;
  // Stryker disable next-line EqualityOperator,ConditionalExpression: any form of this flag changes exactly when today gains or loses its events, which is all the scroll reads it for.
  const noneToday = firstToday < 0;
  // Where the grid last opened, so today's events arriving after it opened (fetched after mount)
  // move it once more, unless the reader has scrolled since.
  const opened = useRef<{ key: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const viewport = rootRef.current!.querySelector<HTMLElement>("[data-scroll-viewport]")!;
    const body = rootRef.current!.querySelector<HTMLElement>("[data-ouro-time-grid-body]")!;
    // Stryker disable next-line EqualityOperator: a scroll of exactly a pixel is a rounding either way.
    if (opened.current?.key === scrollKey && Math.abs(viewport.scrollTop - opened.current.top) > 1) return;
    const minutes = todayIndex < 0 ? workingHours.start * 60 - 30 : firstToday > nowAt!.minutes ? Math.max(nowAt!.minutes - 90, firstToday - 30) : nowAt!.minutes - 90;
    viewport.scrollTop = (between(0, minutes, dayLength) / dayLength) * body.offsetHeight;
    opened.current = { key: scrollKey, top: viewport.scrollTop };
    // Only the days shown, whether today is among them, and whether today has events move the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey, noneToday]);

  // The app's day summaries make the header as tall as they are, which only a measure knows;
  // events scrolled into view stop below it.
  useLayoutEffect(() => {
    if (!renderDaySummary) return;
    const head = rootRef.current!.querySelector<HTMLElement>("[data-ouro-time-grid-head]")!;
    rootRef.current!.style.setProperty("--ouro-time-grid-head", `${head.offsetHeight}px`);
  });

  // In a grid taller than a day, the hours grow to share the room under the header, so the day
  // ends at the grid's foot rather than above it. Neither height depends on the hours'.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const viewport = root.querySelector<HTMLElement>("[data-scroll-viewport]")!;
    const head = root.querySelector<HTMLElement>("[data-ouro-time-grid-head]")!;
    const fill = () => root.style.setProperty("--ouro-time-grid-fill", `${(viewport.clientHeight - head.offsetHeight) / 24}px`);
    // Stryker disable next-line CallExpression: the observer measures as it starts observing, before the first paint; this only measures sooner.
    fill();
    const observer = new ResizeObserver(fill);
    observer.observe(viewport);
    observer.observe(head);
    // Stryker disable next-line ArrowFunction: once the grid is gone, nothing reads what the observer would set.
    return () => observer.disconnect();
  },
  // Stryker disable next-line ArrayDeclaration: any list that never changes runs it once, as this one does.
  []);

  // The day's background lane, measured for its stacks (above). Every day's lane is as wide.
  const hasLane = labelBackground && hasBackground;
  useLayoutEffect(() => {
    if (!hasLane) return;
    const lane = rootRef.current!.querySelector<HTMLElement>("[data-ouro-time-grid-background]")!;
    const measure = () => setLaneWidth(lane.getBoundingClientRect().width);
    // Stryker disable next-line CallExpression: the observer measures as it starts observing, before the first paint; this only measures sooner.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(lane);
    // Stryker disable next-line ArrowFunction: once the lane is gone, nothing reads what the observer would set.
    return () => observer.disconnect();
  }, [hasLane]);

  const focusPiece = (key: string) => {
    setActive(key);
    rootRef.current!.querySelector<HTMLElement>(`[data-ouro-event-key="${CSS.escape(key)}"]`)!.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDownProp?.(event);
    const key = (event.target as HTMLElement).dataset.ouroEventKey;
    if (key === undefined || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const next = stepTo(reachable, key, event.key, getComputedStyle(event.currentTarget).direction === "rtl");
    if (next === undefined) return;
    event.preventDefault();
    focusPiece(next);
  };

  const [hover, setHover] = useState<{ day: number; minutes: number } | null>(null);
  const slotAt = (event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const minutes = Math.floor((((event.clientY - box.top) / box.height) * dayLength) / slotMinutes) * slotMinutes;
    return between(0, minutes, dayLength - slotMinutes);
  };

  const columns = `var(--ouro-time-grid-gutter) repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))`;
  const lanes = allDay.reduce((most, piece) => Math.max(most, piece.lane + 1), 1);
  const nowTop = nowAt ? minutesTall(nowAt.minutes) : undefined;
  // The now label leaves out AM and PM, which the hours beside it already show, so it fits the gutter.
  const nowText = formats.time
    .formatToParts(nowTime)
    .filter((part) => part.type !== "dayPeriod")
    .map((part) => part.value)
    .join("")
    .trim();
  const hourLabels = Array.from({ length: 23 }, (_, index) => index + 1).filter((hour) => !nowAt || todayIndex < 0 || Math.abs(hour * 60 - nowAt.minutes) > 20);

  const renderEvent = (piece: Piece, placed?: { top: number; bottom: number }) => {
    const { event, status, background } = piece;
    const bar = background && !labelBackground;
    const tone = oneOf(tones, event.tone, "primary");
    const lines = placed ? lineCount(placed.bottom - placed.top) : 1;
    const start = placed ? toInstant(event.start)! : null;
    const end = placed ? toInstant(event.end!)! : null;
    // The time as the event shows it, for its name: one line shows only the start, so the end follows it there.
    const shownTime = !start ? null : lines > 1 || start.getTime() === end!.getTime() ? rangeText(formats.time, start, end!) : `${formats.time.format(start)} – ${formats.time.format(end!)}`;
    const content =
      !placed || lines === 1 ? (
        <span className="truncate">
          <span dir="auto" className="font-medium">
            {event.title}
          </span>
          {start ? <span className={mutedClass}> {formats.time.format(start)}</span> : null}
        </span>
      ) : (
        <>
          <span dir="auto" className="line-clamp-(--ouro-lines) font-medium @max-[6rem]/event:block @max-[6rem]/event:truncate" style={{ "--ouro-lines": Math.max(1, lines - (lines >= 3 && event.description ? 2 : 1)) } as CSSProperties}>
            {event.title}
          </span>
          <span className={mutedLineClass}>{rangeText(formats.time, start!, end!)}</span>
          {lines >= 3 && event.description ? (
            <span dir="auto" className={mutedLineClass}>
              {event.description}
            </span>
          ) : null}
        </>
      );
    const shared = {
      "data-ouro-event-key": piece.key,
      "data-status": status,
      "data-tone": tone,
      "data-background": background ? "" : undefined,
      tabIndex: piece.key === tabStop ? 0 : -1,
      "aria-label": spoken(piece, shownTime, !bar && lines >= 3, background ? backgroundLabel : null, words[status]),
      "aria-current": event.id === selectedId ? ("true" as const) : undefined,
      "aria-expanded": event.id === expandedId ? true : undefined,
      className: cn(
        eventClass,
        eventHitClass,
        bar ? backgroundBarClass : [toneBarClass[tone], background ? backgroundFillClass : status === "busy" ? toneFillClass[tone] : plainFillClass, statusClass[status]],
        placed ? timedClass : allDayClass,
        // Under the person's own events, so a background event's touch target never covers them.
        background && "z-[9]",
      ),
      onClick: (click: MouseEvent<HTMLElement>) => {
        setActive(piece.key);
        onEventSelect?.(event, { element: click.currentTarget, background });
      },
    };
    const body = (
      <>
        <TouchTarget />
        {bar ? (
          <span aria-hidden="true" data-ouro-time-grid-bar="" className={cn(backgroundBarFillClass, toneSwatchClass[tone], barStatusClass[status])} />
        ) : (
          <span className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{content}</span>
        )}
      </>
    );
    const control =
      event.href === undefined ? (
        <button type="button" data-ouro-control="time-grid" data-ouro-part="event" {...shared}>
          {body}
        </button>
      ) : (
        <RouterLink href={event.href} data-ouro-control="time-grid" data-ouro-part="event-link" {...shared}>
          {body}
        </RouterLink>
      );
    // A bar names itself to a mouse and to keyboard focus; screen readers hear its name.
    return bar ? (
      <Tooltip
        content={
          <>
            <span className="block tabular-nums">{rangeText(formats.time, start!, end!)}</span>
            <span dir="auto" className="block font-medium">
              {event.title}
            </span>
          </>
        }
      >
        {control}
      </Tooltip>
    ) : (
      control
    );
  };

  // One day's events, each in its place among those it overlaps.
  const placedItems = (placements: ReadonlyArray<DayPlacement<string>>) =>
    placements.map((placed) => {
      const share = 100 / placed.columns;
      return (
        <li
          key={placed.key}
          className="pointer-events-auto absolute pe-px"
          style={{
            top: minutesTall(placed.top),
            height: `calc(${minutesTall(placed.bottom - placed.top)} - 1px)`,
            insetInlineStart: `${placed.column * share}%`,
            width: `${placed.span * share}%`,
          }}
        >
          {renderEvent(pieces.find((piece) => piece.key === placed.key)!, placed)}
        </li>
      );
    });

  // A stack of a day's background events drawn as one: their count and their time, which opens
  // their list, each item choosing its event as a press on it would.
  const stackItem = (stack: ReadonlyArray<DayPlacement<string>>) => {
    const members = stack.map((placed) => pieces.find((piece) => piece.key === placed.key)!);
    const key = stack[0]!.key;
    const top = Math.min(...stack.map((placed) => placed.top));
    const bottom = Math.max(...stack.map((placed) => placed.bottom));
    const starts = members.map((piece) => toInstant(piece.event.start)!.getTime());
    const ends = members.map((piece) => toInstant(piece.event.end!)!.getTime());
    const element = () => rootRef.current!.querySelector<HTMLElement>(`[data-ouro-event-key="${CSS.escape(key)}"]`)!;
    return (
      <li key={key} className="pointer-events-auto absolute inset-x-0 pe-px" style={{ top: minutesTall(top), height: `calc(${minutesTall(bottom - top)} - 1px)` }}>
        <Menu
          side="right"
          trigger={
            <button
              type="button"
              data-ouro-control="time-grid"
              data-ouro-part="stack"
              data-ouro-event-key={key}
              data-background=""
              tabIndex={key === tabStop ? 0 : -1}
              aria-current={members.some((piece) => piece.event.id === selectedId) ? "true" : undefined}
              // The arrows move through the grid, as from any event; Enter and Space press it, which opens the list.
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => (event as typeof event & { preventBaseUIHandler: () => void }).preventBaseUIHandler()}
              onFocus={() => setActive(key)}
              className={cn(eventClass, eventHitClass, toneBarClass.secondary, backgroundFillClass, statusClass.busy, timedClass, "z-[9]")}
            >
              <TouchTarget />
              <span className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <span className="truncate font-medium">{stackLabel(stack.length)}</span>
                <span className={mutedLineClass}>{rangeText(formats.time, new Date(Math.min(...starts)), new Date(Math.max(...ends)))}</span>
              </span>
            </button>
          }
        >
          {members.map((piece) => (
            <MenuItem key={piece.key} href={piece.event.href} onClick={() => onEventSelect?.(piece.event, { element: element(), background: true })}>
              <span dir="auto">{piece.event.title}</span>
              <span className={mutedClass}> {rangeText(formats.time, toInstant(piece.event.start)!, toInstant(piece.event.end!)!)}</span>
            </MenuItem>
          ))}
        </Menu>
      </li>
    );
  };

  return (
    <div
      {...rest}
      ref={setRoot}
      data-ouro="time-grid"
      data-view={view}
      className={cn(
        "relative box-border flex h-144 min-h-0 min-w-0 flex-col text-foreground",
        "[--ouro-time-grid-gutter:4rem] [--ouro-time-grid-hour:max(3rem,var(--ouro-time-grid-fill,0px))] [--ouro-time-grid-tint:14%] pointer-coarse:[--ouro-time-grid-hour:max(3.5rem,var(--ouro-time-grid-fill,0px))] dark:[--ouro-time-grid-tint:24%]",
        className,
      )}
      style={
        {
          ...(renderDaySummary ? {} : { "--ouro-time-grid-head": `${3.75 + lanes * 1.5}rem` }),
          "--ouro-time-grid-lane": labelBackground ? "clamp(7rem, 40%, 32rem)" : "0.75rem",
          ...style,
        } as CSSProperties
      }
      onKeyDown={onKeyDown}
    >
      <ScrollArea label={label} className="min-h-0 flex-1">
        <div data-ouro-time-grid-head="" className="sticky top-0 z-40 grid border-0 border-b border-solid border-border bg-background" style={{ gridTemplateColumns: columns }}>
          <div aria-hidden="true" />
          {days.map((day, index) => (
            <div
              key={day}
              aria-hidden="true"
              data-today={index === todayIndex ? "" : undefined}
              className="group/day @container/day min-w-0 border-0 border-s border-solid border-border"
            >
              <span className="flex min-w-0 items-center gap-1.5 overflow-hidden px-2 py-1.5 @max-[4.5rem]/day:flex-col @max-[4.5rem]/day:gap-0.5 @max-[4.5rem]/day:px-0.5">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-base leading-none font-semibold tabular-nums group-data-today/day:bg-primary group-data-today/day:text-primary-foreground forced-colors:group-data-today/day:border-2 forced-colors:group-data-today/day:border-solid">
                {
                  // Stryker disable next-line ConditionalExpression: in the locales tested the day comes first; the search is for one where it does not
                  formats.dayNumber.formatToParts(utcDate(day)).find((part) => part.type === "day")!.value
                }
              </span>
              <span className="truncate text-xs text-muted-foreground group-data-today/day:font-medium group-data-today/day:text-foreground">{formats.weekdayShort.format(utcDate(day))}</span>
              </span>
            </div>
          ))}
          {renderDaySummary ? (
            <>
              <div aria-hidden="true" />
              {days.map((day) => (
                <div key={day} role="group" aria-label={formats.fullDay.format(utcDate(day))} data-ouro-time-grid-summary="" className="min-w-0 border-0 border-s border-solid border-border px-2 pb-1 text-xs text-muted-foreground">
                  {renderDaySummary(day)}
                </div>
              ))}
            </>
          ) : null}
          <div aria-hidden="true" className="flex items-start justify-end py-1 pe-2 text-[11px] leading-5 text-muted-foreground">
            {allDayLabel}
          </div>
          {allDay.length > 0 ? (
            <ul
              role="list"
              aria-label={allDayLabel}
              className="m-0 grid list-none auto-rows-[1.375rem] gap-y-0.5 p-0 py-1"
              style={{ gridColumn: "2 / -1", gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))`, minHeight: `${lanes * 1.5 + 0.5}rem` }}
            >
              {allDay.map((span) => (
                <li key={span.key} className="min-w-0 px-0.5" style={{ gridColumn: `${span.first + 1} / ${span.last + 2}`, gridRow: span.lane + 1 }}>
                  {renderEvent(pieces.find((piece) => piece.key === span.key)!)}
                </li>
              ))}
            </ul>
          ) : (
            <div aria-hidden="true" style={{ minHeight: "2rem" }} />
          )}
        </div>
        <div data-ouro-time-grid-body="" className="relative grid" style={{ gridTemplateColumns: columns, height: minutesTall(dayLength) }}>
          <div aria-hidden="true" className="relative">
            {hourLabels.map((hour) => (
              <span key={hour} className="absolute end-2 -translate-y-1/2 text-[11px] leading-4 whitespace-nowrap text-muted-foreground tabular-nums" style={{ top: minutesTall(hour * 60) }}>
                {formats.hour.format(Date.UTC(2026, 0, 1, hour))}
              </span>
            ))}
            {nowAt && todayIndex >= 0 ? (
              <span data-ouro-time-grid-now-label="" className="absolute end-1 flex -translate-y-1/2 flex-col items-end gap-0.5" style={{ top: nowTop }}>
                {nowAdornment ? <span className="absolute end-0 bottom-full mb-0.5">{nowAdornment}</span> : null}
                <span className="rounded-sm bg-background px-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap text-destructive tabular-nums">
                  {nowText}
                </span>
              </span>
            ) : null}
          </div>
          {days.map((day, index) => {
            const off = weekend.includes(utcDate(day).getUTCDay());
            return (
              <div key={day} className="relative min-w-0 border-0 border-s border-solid border-border">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_bottom,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_50%,transparent)_1px,transparent_1px)] [background-position:0_0,0_calc(var(--ouro-time-grid-hour)/2)] [background-size:100%_var(--ouro-time-grid-hour)]"
                />
                {off ? (
                  <div aria-hidden="true" data-ouro-time-grid-off="" className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]" />
                ) : (
                  <>
                    <div aria-hidden="true" data-ouro-time-grid-off="" className="pointer-events-none absolute inset-x-0 top-0 bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]" style={{ height: minutesTall(workingHours.start * 60) }} />
                    <div aria-hidden="true" data-ouro-time-grid-off="" className="pointer-events-none absolute inset-x-0 bottom-0 bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]" style={{ top: minutesTall(workingHours.end * 60) }} />
                  </>
                )}
                {onSlotSelect ? (
                  <div
                    aria-hidden="true"
                    data-ouro-time-grid-slots=""
                    className="absolute inset-0 cursor-cell"
                    onPointerMove={(event: PointerEvent<HTMLDivElement>) => setHover(event.pointerType === "mouse" ? { day: index, minutes: slotAt(event) } : null)}
                    onPointerLeave={() => setHover(null)}
                    onClick={(event) => {
                      const minutes = slotAt(event);
                      onSlotSelect({ start: formats.clock.instant(day, minutes), end: formats.clock.instant(day, minutes + slotMinutes) });
                    }}
                  >
                    {hover?.day === index ? (
                      <span
                        data-ouro-time-grid-slot=""
                        className="pointer-events-none absolute inset-x-0.5 box-border rounded-md border border-dashed border-primary px-1.5 text-[11px] leading-4 text-muted-foreground"
                        style={{ top: minutesTall(hover.minutes), height: minutesTall(slotMinutes) }}
                      >
                        {formats.time.format(formats.clock.instant(day, hover.minutes))}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {nowAt && todayIndex >= 0 ? (
                  <div
                    aria-hidden="true"
                    data-ouro-time-grid-now={index === todayIndex ? "today" : ""}
                    className={cn(
                      "pointer-events-none absolute inset-x-0 z-5 -translate-y-px border-0 border-t border-solid",
                      index === todayIndex ? "border-t-2 border-destructive" : "border-destructive/35",
                    )}
                    style={{ top: nowTop }}
                  >
                    {index === todayIndex ? <span className="absolute -start-1.5 -top-1.5 size-2.5 rounded-full bg-destructive forced-colors:bg-[CanvasText]" /> : null}
                  </div>
                ) : null}
                {timed[index]!.length > 0 ? (
                  <ul
                    role="list"
                    aria-label={formats.fullDay.format(utcDate(day))}
                    aria-current={index === todayIndex ? "date" : undefined}
                    className={cn("pointer-events-none absolute inset-0 m-0 list-none p-0", hasBackground && "start-(--ouro-time-grid-lane)")}
                  >
                    {placedItems(timed[index]!)}
                  </ul>
                ) : null}
                {behind[index]!.length > 0 ? (
                  <ul
                    role="list"
                    aria-label={`${formats.fullDay.format(utcDate(day))}, ${backgroundLabel}`}
                    data-ouro-time-grid-background=""
                    className={cn(
                      "pointer-events-none absolute inset-y-0 start-0 m-0 box-border w-(--ouro-time-grid-lane) list-none p-0",
                      // A day's wide lane keeps apart from the person's own with a dashed edge.
                      labelBackground && "border-0 border-e border-dashed border-border",
                    )}
                  >
                    {placedItems(behind[index]!.filter((placed) => !stackOf.has(placed.key)))}
                    {stacks[index]!.map(stackItem)}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * What a screen reader hears for an event: first the words it shows, in the order it shows them
 * (its title, its time and, when it has room, its description), then its day, what background
 * events are, its status and a description it has no room to show.
 * @claim "What a screen reader hears for an event" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > shows the title first, then the time and the description as the event's height allows)
 */
function spoken(piece: Piece, time: string | null, roomy: boolean, background: string | null, status: string): string {
  const { description } = piece.event;
  return [piece.event.title, time, roomy ? description : null, ...piece.when, background, status, roomy ? null : description].filter(Boolean).join(", ");
}
