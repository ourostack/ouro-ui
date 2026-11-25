"use client";

import {
  useEffect,
  useId,
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
import { navigationKey } from "@/registry/ouro/lib/ouro/navigation-key";
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
  awayBarClass,
  awayFillClass,
  awaySwatchClass,
  markedMutedClass,
  minuteClock,
  stepTo,
  plainFillClass,
  slotSizes,
  periodShift,
  stackMinWidth,
  todayOn,
  foldsOf,
  stacksOf,
  statusClass,
  statuses,
  timedBarClass,
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

/** Why a day is marked (TimeGrid's `markedDays`): the words, and the tone of its tint. */
export interface TimeGridMark {
  /** The words that say why, such as "Out of office". */
  label: string;
  /** The tint's tone; `"away"` is the colour of an `away` event, so an out-of-office day and its meetings agree. @default "primary" */
  tone?: TimeGridTone | "away" | undefined;
}

/**
 * A marked day's tint, as an inline background so it adds no class: its tone at half an event's tint
 * (`--ouro-time-grid-tint`), so events on the day still stand out.
 * @claim "A marked day's tint" registry/ouro/components/ouro/time-grid/time-grid.tsx verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid.tsx, /backgroundColor: `color-mix\(in oklab, \$\{markColor\[tone\]\} calc\(var\(--ouro-time-grid-tint\) \/ 2\), transparent\)`/)
 */
const markColor: Record<TimeGridTone | "away", string> = { away: "var(--ouro-away)", primary: "var(--primary)", secondary: "var(--muted-foreground)", success: "var(--success)", warning: "var(--warning)", destructive: "var(--destructive)" };
const markTones = [...tones, "away"] as const;
const markStyle = (tone: TimeGridTone | "away"): CSSProperties => ({ backgroundColor: `color-mix(in oklab, ${markColor[tone]} calc(var(--ouro-time-grid-tint) / 2), transparent)` });

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
   * `cancelled` is struck through; `away`, out of office, is filled in the away colour
   * (`--ouro-away`, Teams' purple) whatever the event's `tone`. Screen readers hear every status
   * but busy, in the words of `statusLabels`.
   * @default "busy"
   * @claim "Screen readers hear every" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > names each event by the words it shows first, its title and its time, then its day, its status and its description)
   */
  status?: TimeGridStatus | (string & { 'Use "busy", "tentative", "free", "unanswered", "cancelled" or "away" (oof and out-of-office are "away")': never }) | undefined;
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
   * and weekend days, are shaded, and the grid opens half an hour before the earlier of its
   * start and the first event shown. The now line shows when it falls in that window.
   * @default { start: 8, end: 17 }
   * @claim "start: 8, end: 17" registry/ouro/components/ouro/time-grid/time-grid.tsx verify:fileLine(registry/ouro/components/ouro/time-grid/time-grid.tsx, /const defaultWorkingHours = \{ start: 8, end: 17 \}/)
   */
  workingHours?: { start: number; end: number } | undefined;
  /** The selected event's id: it gets a deeper fill of its own colour and `aria-current`. */
  selectedId?: string | null | undefined;
  /**
   * Called with the event when someone presses it, or presses Enter on it, and with its element
   * and whether it is a background event, so a popover of your own can point at it.
   * @claim "and with its element" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > tells onEventSelect which element was pressed, and marks the one whose popover is open)
   */
  onEventSelect?: ((event: TimeGridEvent, details: TimeGridSelectDetails) => void) | undefined;
  /**
   * Called with the ISO date to show when a key moves the days while focus is in the grid: Page
   * Down and ⌥↓ (Alt+↓) the next day or week, Page Up and ⌥↑ the one before, and ⌥⇧Y
   * (Alt+Shift+Y) today, as in Teams. With `onSlotSelect` set, Page Up and Page Down on the
   * slots move an hour instead, so use ⌥↑ and ⌥↓ there. Set `date` to it. `TimeGridNav` gives the same moves as
   * buttons, with these keys in their tooltips.
   * @claim "Called with the ISO date to show when a key moves the days" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > moves to the next or previous period with Page Down and Page Up, or Alt with the arrows, and to today with Alt+Shift+Y)
   */
  onDateChange?: ((date: string) => void) | undefined;
  /**
   * Events that are not the person's own, such as a shared calendar, a colleague's or a room's.
   * Each day draws them in a lane of their own at its start, beside the person's events: thin
   * bars that name themselves in a tooltip in a week, and labelled ones in a day. Each is a
   * button that `onEventSelect` gets, reached with the arrow keys like the others. Timed events
   * only: those that are all day, or 24 hours or longer, are left out.
   * The person's events make room for the lane only where a background event shares their time.
   * @claim "make room for the lane only where" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid background events > leaves room for the background lane only where a background event shares an event's time (%s))
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
   * The words on the chip that folds a day's overlapping events when its columns are too narrow to
   * read a few characters of a title: the earliest events stay in their columns and the rest fold
   * into a chip that opens their list. Translate it with your app.
   * @default (count) => `+${count} more events`
   */
  moreLabel?: ((count: number) => string) | undefined;
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
   * Days to mark, such as the days someone is out of office or a public holiday: an ISO date maps to
   * the words that say why, and a tone (primary unless you give one). A marked day's column takes the
   * tone's tint from its header to its last hour, and shows the words under the weekday; screen
   * readers hear them with the day.
   * @claim "A marked day's column takes the tone's tint" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > tints a marked day's column from its header to its last hour, and says why in words)
   */
  markedDays?: Readonly<Record<string, TimeGridMark>> | undefined;
  /**
   * Called when someone presses an empty part of a day, with the slot under the pointer, for a
   * new event there. A mouse shows the slot before the press, and dragging down or up a day's
   * column gives the range from the first slot to the end of the last.
   *
   * With it, the slots take a Tab stop of their own, ahead of the timed events; the arrow keys move
   * between slots there, and between events once an event has focus. In the slots the arrow keys
   * move a slot up or down and a day left or right (mirrored in right-to-left), Home and End go to
   * the day's first and last slot, Page Up and Page Down move an hour, and Enter or Space calls `onSlotSelect`.
   * A screen reader reads the slot, such as "Tuesday, 10:30 AM", as focus moves.
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
  /** The keyboard's slots' name, heard when focus enters them. Translate it with your app. @default "Time slots" */
  slotsLabel?: string | undefined;
  /**
   * The words screen readers hear for each status, after the event's title. Translate them with
   * your app.
   * @default { tentative: "tentative", free: "free", unanswered: "needs your answer", cancelled: "cancelled", away: "out of office" }
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
  /** Not a prop. The grid opens before the earlier of the start of `workingHours` and the first event shown. */
  scrollToTime?: { "Use workingHours={{ start: 8, end: 17 }}": never };
}

/** Props for {@link TimeGrid}: its own props and the div attributes it passes through to the root. */
export type TimeGridProps = Omit<HTMLAttributes<HTMLDivElement>, keyof TimeGridOwnProps> & TimeGridOwnProps;

// Busy, the usual, goes unsaid.
const defaultStatusLabels: Record<TimeGridStatus, string> = { busy: "", tentative: "tentative", free: "free", unanswered: "needs your answer", cancelled: "cancelled", away: "out of office" };
/** `value` when it is one of `list`, else `fallback`. */
const oneOf = <Name extends string>(list: readonly Name[], value: string | undefined, fallback: Name): Name => ((list as readonly (string | undefined)[]).includes(value) ? (value as Name) : fallback);
const defaultWorkingHours = { start: 8, end: 17 };
const overlapMinWidth = "4.5rem";
// The strip a day gives the chip that folds the overlapping events it has no room for.
const chipWidth = "2rem";

const clock = minuteClock();
// Stryker disable next-line ArrowFunction: the server's time only has to be no time, which 0 and undefined both are
const serverNow = () => 0;

// An event's time and description: muted text mixed toward the foreground, further than on a
// plain muted surface, because a dark theme colour tints the fill under it.
const mutedClass = "text-[color-mix(in_oklab,var(--muted-foreground)_55%,var(--foreground))]";
const mutedLineClass = "truncate text-[color-mix(in_oklab,var(--muted-foreground)_55%,var(--foreground))]";

// The default for backgroundEvents: one array, so the layout is worked out again only when the events change.
const noEvents: readonly TimeGridEvent[] = [];

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
// Node's ICU spaces a range with thin (U+2009) and narrow (U+202F) spaces where browsers put plain ones.
const plainSpaces = (text: string) => text.replace(/[\u2009\u202f]/g, " ");
const between = (low: number, value: number, high: number) => Math.min(high, Math.max(low, value));
/** Hour and half-hour hairlines, drawn as borders. */
const hourLines = Array.from({ length: 48 }, (_, index) => ({ at: index * 30, half: index % 2 === 1 }));
const hourLineClass = "absolute inset-x-0 border-0 border-t border-solid border-border";
const halfHourLineClass = "absolute inset-x-0 border-0 border-t border-solid border-[color-mix(in_oklab,var(--border)_50%,transparent)]";

/** A length in minutes as a share of the grid's hour height. */
const minutesTall = (minutes: number) => `calc(var(--ouro-time-grid-hour) * ${minutes / 60})`;

/**
 * A day, work week or week of hours, with events placed by their times: the calendar grid of
 * a mail or meeting app. Each day has a column under a header, today's marked; all-day events
 * have a row of their own; hours run down the side in the locale's words. Events that overlap sit side by
 * side, each a button (a link with `href`) that shows its title first and is named for screen
 * readers by the words it shows, in their order, then its day and its status ("Design review,
 * 9:00 – 10:00 AM, Thursday, needs your answer"). Its lines are separate words even where a column
 * stacks them, so the name holds what it shows and a speech-input user can say it to press it
 * (WCAG 2.5.3, Label in Name). The grid is one Tab stop: the arrow keys move through events in time
 * order (Up and Down) and across days (Left and Right), Home and End go to the first and the
 * last, and Enter opens one. It opens half an hour before the working day or the first event
 * shown, whichever is earlier, never with an event cut across its top, and a now line
 * runs across today, under events so it never crosses their text.
 *
 * Use `Calendar` instead to pick a date from a month, and `Table` or `ItemGroup` for an agenda
 * list of events.
 *
 * @group Data
 * @see https://ui.ouroboros.bot/docs/time-grid
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
 * @claim "Its lines are separate words" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid label in name > shows each event's lines as words its name holds in order, on one line, two or three) verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid label in name > the same event with its lines run together fails the rule, so the check can fail)
 * @claim "Events that overlap sit side" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > shares a day's width between overlapping events)
 * @claim "It opens half an hour before the working day or the first event shown" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > opens before the earlier of the working day's start and the week's first event, not at now)
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
    backgroundEvents = noEvents,
    backgroundLabel = "Other calendars",
    stackLabel = (count: number) => `${count} events`,
    moreLabel = (count: number) => `+${count} more events`,
    expandedId,
    renderDaySummary,
    markedDays,
    onSlotSelect,
    slotMinutes: slotProp = 30,
    allDayLabel = "All day",
    slotsLabel = "Time slots",
    statusLabels,
    nowAdornment,
    className,
    ref,
    style,
    onKeyDown: onKeyDownProp,
    onDateChange,
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
  const markOf = (day: string) => {
    const mark = markedDays && Object.hasOwn(markedDays, day) ? markedDays[day] : undefined;
    return mark?.label ? { label: mark.label, style: markStyle(oneOf(markTones, mark.tone, "primary")) } : null;
  };
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

  const words = { ...defaultStatusLabels, ...statusLabels };
  // Two times of day. Across midnight Intl would add both dates, so the times are joined instead. Node's ICU spaces a
  // range with thin and narrow spaces where browsers put plain ones, so a server's range would not hydrate: it is
  // written with plain spaces everywhere (plainSpaces).
  const rangeText = (format: Intl.DateTimeFormat, start: Date, end: Date) =>
    formats.clock.at(start.getTime()).day === formats.clock.at(end.getTime()).day
      ? plainSpaces(format.formatRange(start, end))
      : `${format.format(start)} – ${format.format(end)}`;
  // The events cut into what each shown day draws, in the order the arrow keys take them. Laid out once per change
  // to the events, the days or their formats, not on every render (an arrow key, a clock tick, a measure).
  const { pieces, problems, allDay, timed, behind, hasBackground } = useMemo(() => {
    const problems: DevWarning[] = [];
    const pieces: Piece[] = [];
    const allDaySpans: Array<{ key: string; first: number; last: number }> = [];
    const timedItems: Array<Array<{ key: string; start: number; end: number }>> = days.map(() => []);
    // An all-day event's days: its weekday, or the dates it runs between.
    const daysText = (first: string, last: string) => (first === last ? formats.weekdayLong.format(utcDate(first)) : plainSpaces(formats.fullDay.formatRange(utcDate(first), utcDate(last))));
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
          const when = from.minutes === 0 && to.minutes === 0 ? [daysText(from.day, lastDay), allDayLabel] : [plainSpaces(formats.acrossDays.formatRange(start, end))];
          pieces.push({ key, event, status, background, day: span.first, start: -1, end: dayLength, when });
          allDaySpans.push({ key, ...span });
          continue;
        }
        // The time itself is heard as the event shows it, right after its title.
        const when = from.day === lastDay ? [formats.weekdayLong.format(utcDate(from.day))] : [plainSpaces(formats.acrossDays.formatRange(start, end))];
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
    return { pieces, problems, allDay, timed, behind, hasBackground };
  }, [events, backgroundEvents, days, formats, allDayLabel]);

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
              `event "${event.id}": status="${String(event.status)}" is not a status; use "busy", "tentative", "free", "unanswered", "cancelled" or "away" (out of office)`,
              '{ status: "away" }',
            ],
            event.allDay !== undefined && [`event "${event.id}": allDay is not a field; an all-day event's start is a date`, '{ start: "2026-03-12" }'],
            event.color !== undefined && [`event "${event.id}": color is not a field; colours come from the theme`, '{ tone: "success" }'],
          ]),
          defaultView !== undefined && ["defaultView is not a prop; the app keeps the view", '<TimeGrid view="work-week">'],
          defaultDate !== undefined && ["defaultDate is not a prop; the app keeps the date", '<TimeGrid date="2026-03-12">'],
          onSelectEvent !== undefined && ["onSelectEvent is not a prop", "<TimeGrid onEventSelect={(event) => open(event.id)}>"],
          onSelectSlot !== undefined && ["onSelectSlot is not a prop", "<TimeGrid onSlotSelect={({ start, end }) => create(start, end)}>"],
          scrollToTime !== undefined && ["scrollToTime is not a prop; the grid opens at the working day's start or the first event", "<TimeGrid workingHours={{ start: 8, end: 17 }}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // A week's background events are bars too thin for text; a day has room to label them.
  const labelBackground = view === "day";
  // In a day, a stack of background events too narrow to label each is drawn as one count that
  // opens their list. It needs the lane's width, which only a measure knows; server HTML, and
  // the first render before it, draw each event.
  const [laneWidth, setLaneWidth] = useState(0);
  // The stacks in each day, and each folded event's stack by its key (the stack goes by its first event's key):
  // worked out once per layout and lane width.
  const { stacks, stackOf: stackOfBackground } = useMemo(() => {
    const stacks = behind.map((placements) =>
      // Stryker disable next-line ConditionalExpression,EqualityOperator: an unmeasured lane is measured before the first paint, which decides either way.
      labelBackground && laneWidth > 0
        ? // Stryker disable next-line ConditionalExpression,EqualityOperator,ArithmeticOperator: a lone event spans the whole lane, at least 7rem, so it is never too narrow; one exactly at the minimum reads either way; an event spread over columns sits beside narrower ones.
          stacksOf(placements).filter((stack) => stack.length > 1 && stack.some((placed) => (laneWidth * placed.span) / placed.columns < stackMinWidth))
        : [],
    );
    return { stacks, stackOf: new Map(stacks.flat().flatMap((stack) => stack.map((placed) => [placed.key, stack] as const))) };
  }, [behind, labelBackground, laneWidth]);
  // The width of one day and of a rem, which decide how many overlapping events a day can show: the
  // server HTML and the first render draw them all, in steps, until a measure.
  const [dayWidth, setDayWidth] = useState(0);
  const [dayRem, setDayRem] = useState(16);
  const { shown, folds, reserved, stackOf } = useMemo(() => {
    const folds = timed.map((placements) => (dayWidth > 0 ? foldsOf(placements, dayWidth / dayRem) : []));
    const folded = new Set(folds.flat().flatMap((fold) => fold.folded.map((placed) => placed.key)));
    const shown = timed.map((placements, index) => {
      const adjust = new Map(folds[index]!.flatMap((fold) => fold.shown.map((placed) => [placed.key, placed] as const)));
      return placements.filter((placed) => !folded.has(placed.key)).map((placed) => adjust.get(placed.key) ?? placed);
    });
    const members = new Map(folds.flat().flatMap((fold) => fold.folded.map((placed) => [placed.key, fold.folded] as const)));
    const reserved = new Set(folds.flat().flatMap((fold) => fold.shown.map((placed) => placed.key)));
    return { shown, folds, reserved, stackOf: new Map([...stackOfBackground, ...members]) };
  }, [timed, dayWidth, dayRem, stackOfBackground]);
  const reachable = pieces.filter((piece) => (stackOf.get(piece.key)?.[0]!.key ?? piece.key) === piece.key);

  // The event with the Tab stop: the last one moved to, else the selected one, else the first.
  const [active, setActive] = useState<string | null>(null);
  const stopFor = (key: string | undefined) => stackOf.get(key as string)?.[0]!.key ?? key;
  const tabStop = stopFor(pieces.find((piece) => piece.key === active)?.key ?? pieces.find((piece) => piece.event.id === selectedId)?.key ?? pieces[0]?.key);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRoot = (element: HTMLDivElement | null) => {
    rootRef.current = element;
    if (typeof ref === "function") return ref(element);
    if (ref) ref.current = element;
  };

  // Open half an hour before the earlier of the working day's start and the first event of the days shown,
  // so the grid never opens on empty hours and never hides an early event. Now is not the anchor: its line
  // shows wherever it falls in the window, and a reader who wants it scrolls to it. Once for each set of
  // days, and again when the earliest event changes (events fetched after mount), unless the reader has scrolled.
  // An event on any day shown that runs across that line opens whole: the grid opens at its start.
  const scrollKey = `${days[0]}:${days.length}`;
  // Where the first event of the days shown starts, in minutes, or the end of the day with none.
  const firstEvent = Math.min(dayLength, ...timed.flatMap((day) => day.map((placed) => placed.top)));
  // Where the grid last opened, so today's events arriving after it opened (fetched after mount)
  // move it once more, unless the reader has scrolled since.
  const opened = useRef<{ key: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const viewport = rootRef.current!.querySelector<HTMLElement>("[data-scroll-viewport]")!;
    const body = rootRef.current!.querySelector<HTMLElement>("[data-ouro-time-grid-body]")!;
    // The observer's first callback runs after layout and before the first paint, so the grid opens scrolled and the commit reads nothing.
    const open = () => {
      // Stryker disable next-line EqualityOperator: a scroll of exactly a pixel is a rounding either way.
      if (opened.current?.key === scrollKey && Math.abs(viewport.scrollTop - opened.current.top) > 1) return;
      const line = Math.min(workingHours.start * 60, firstEvent) - 30;
      // The line sits half an hour above every timed event, so no event is cut in half under the header.
      viewport.scrollTop = (between(0, line, dayLength) / dayLength) * body.offsetHeight;
      opened.current = { key: scrollKey, top: viewport.scrollTop };
    };
    const observer = new ResizeObserver(() => {
      // Stryker disable next-line CallExpression: a later resize that runs open again lands on the place the reader left, which its guard keeps.
      observer.disconnect();
      open();
    });
    observer.observe(body);
    // Stryker disable next-line ArrowFunction: once the grid is gone, nothing reads what the observer would set.
    return () => observer.disconnect();
    // Only the days shown and the earliest event move the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey, firstEvent]);

  // In a grid taller than a day, the hours grow to share the room under the header, so the day
  // ends at the grid's foot rather than above it. Neither height depends on the hours'.
  const summaries = Boolean(renderDaySummary);
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const viewport = root.querySelector<HTMLElement>("[data-scroll-viewport]")!;
    const head = root.querySelector<HTMLElement>("[data-ouro-time-grid-head]")!;
    const fill = () => {
      const headHeight = head.offsetHeight;
      // The app's day summaries make the header as tall as they are, which only a measure knows; events scrolled into view stop below it.
      if (summaries) root.style.setProperty("--ouro-time-grid-head", `${headHeight}px`);
      root.style.setProperty("--ouro-time-grid-fill", `${(viewport.clientHeight - headHeight) / 24}px`);
    };
    const observer = new ResizeObserver(fill);
    // Stryker disable next-line CallExpression: a change that resizes the room in a test resizes the header's sticky box with it, which measures again.
    observer.observe(viewport);
    observer.observe(head);
    // Stryker disable next-line ArrowFunction: once the grid is gone, nothing reads what the observer would set.
    return () => observer.disconnect();
  },
  [summaries]);

  // The day's background lane, measured for its stacks (above). Every day's lane is as wide.
  const hasLane = labelBackground && hasBackground;
  useLayoutEffect(() => {
    if (!hasLane) return;
    const lane = rootRef.current!.querySelector<HTMLElement>("[data-ouro-time-grid-background]")!;
    const measure = () => setLaneWidth(lane.getBoundingClientRect().width);
    const observer = new ResizeObserver(measure);
    observer.observe(lane);
    // Stryker disable next-line ArrowFunction: once the lane is gone, nothing reads what the observer would set.
    return () => observer.disconnect();
  }, [hasLane]);

  const dayKey = days.join();
  // One day's width, which the days share, and the size of a rem at the current text size.
  useLayoutEffect(() => {
    const day = rootRef.current!.querySelector<HTMLElement>("[data-ouro-time-grid-day]");
    if (!day) return;
    const measure = () => {
      setDayWidth(day.getBoundingClientRect().width);
      setDayRem(parseFloat(getComputedStyle(document.documentElement).fontSize));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(day);
    // Stryker disable next-line ArrowFunction: once the day is gone, nothing reads what the observer would set.
    return () => observer.disconnect();
    // The day column is replaced when the dates change, so the observer follows it.
  }, [dayKey]);

  const focusPiece = (key: string) => {
    setActive(key);
    rootRef.current!.querySelector<HTMLElement>(`[data-ouro-event-key="${CSS.escape(key)}"]`)!.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDownProp?.(event);
    if (onDateChange && !event.defaultPrevented) {
      const shift = periodShift(event, view);
      // ⌥⇧Y by its physical key, since Option changes the character on a Mac.
      const today = event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === "KeyY";
      if (shift !== 0 || today) {
        event.preventDefault();
        onDateChange(today ? todayOn(formats.clock) : addDays(date, shift));
        return;
      }
    }
    const key = (event.target as HTMLElement).dataset.ouroEventKey;
    // ⌘↑ and ⌘↓ on a Mac are its Home and End. Shift changes nothing here.
    const pressed = navigationKey({ key: event.key, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: false });
    if (key === undefined || event.defaultPrevented) return;
    // A modified key the grid leaves alone is null, which moves to no event.
    const next = stepTo(reachable, key, pressed as string, getComputedStyle(event.currentTarget).direction === "rtl");
    if (next === undefined) return;
    event.preventDefault();
    focusPiece(next);
  };

  const [hover, setHover] = useState<{ day: number; minutes: number } | null>(null);
  // The keyboard's slot is virtual: the grid below owns focus and names this slot through aria-activedescendant.
  const [heldCursor, setCursor] = useState<{ day: number; minutes: number } | null>(null);
  // The days can shrink under a focused grid (a controlled `view` changes), so the cursor stays on a day that exists.
  const cursor = heldCursor ? { ...heldCursor, day: Math.min(heldCursor.day, days.length - 1) } : null;
  const cursorBase = useId();
  // Each slot is its own cell with its own id: a screen reader announces a move only when the active descendant changes, not when one cell's text does.
  const cursorId = cursor ? `${cursorBase}-${cursor.day}-${cursor.minutes}` : undefined;
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const slot = cursorRef.current;
    if (!slot) return;
    // The sticky day header covers the top of the scrolling area, so a slot scrolled "into view" would sit behind it.
    slot.style.scrollMarginTop = `${rootRef.current!.querySelector<HTMLElement>("[data-ouro-time-grid-head]")!.offsetHeight}px`;
    slot.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [heldCursor]);
  const cursorStart = () => {
    const from = nowAt && todayIndex >= 0 ? nowAt.minutes : workingHours.start * 60;
    // Stryker disable next-line ArithmeticOperator: a start below the day's end already sits on a slot, so the upper clamp never moves it.
    return { day: Math.max(todayIndex, 0), minutes: between(0, Math.floor(from / slotMinutes) * slotMinutes, dayLength - slotMinutes) };
  };
  const onSlotKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Stryker disable next-line ConditionalExpression,LogicalOperator: the handler is attached only with onSlotSelect and a cursor set on focus, so this guard only narrows types.
    if (!onSlotSelect || !cursor || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const day = days[cursor.day]!;
      onSlotSelect({ start: formats.clock.instant(day, cursor.minutes), end: formats.clock.instant(day, cursor.minutes + slotMinutes) });
      return;
    }
    const sideways = getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1;
    const moves: Record<string, { day: number; minutes: number }> = {
      ArrowUp: { day: cursor.day, minutes: cursor.minutes - slotMinutes },
      ArrowDown: { day: cursor.day, minutes: cursor.minutes + slotMinutes },
      ArrowLeft: { day: cursor.day - sideways, minutes: cursor.minutes },
      ArrowRight: { day: cursor.day + sideways, minutes: cursor.minutes },
      Home: { day: cursor.day, minutes: 0 },
      // Stryker disable next-line ArithmeticOperator: the move is clamped to the last slot again where it is applied, so a larger value lands on the same slot.
      End: { day: cursor.day, minutes: dayLength - slotMinutes },
      PageUp: { day: cursor.day, minutes: cursor.minutes - 60 },
      PageDown: { day: cursor.day, minutes: cursor.minutes + 60 },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    // Stryker disable next-line ArithmeticOperator: the held day is clamped again where the cursor is read, so a larger bound shows the same day.
    setCursor({ day: between(0, move.day, days.length - 1), minutes: between(0, move.minutes, dayLength - slotMinutes) });
  };
  const [drag, setDrag] = useState<{ day: number; from: number; to: number } | null>(null);
  const dragged = useRef(false);
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      dragged.current = true;
      setDrag(null);
    };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [dragging]);
  const slotAt = (event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const minutes = Math.floor((((event.clientY - box.top) / box.height) * dayLength) / slotMinutes) * slotMinutes;
    return between(0, minutes, dayLength - slotMinutes);
  };
  // The preview spans one slot across its day's column, so it is left off where one of the person's own timed
  // events covers that slot: the card (opaque, above the slots) would hide its text. Background events sit in
  // the lane the preview starts after, so they never cover it.
  // The person's own events that overlap a background event in time, with the rest of their stack of overlapping events
  // so they share one layout, by day. Only these make room for the lane.
  const clearOfLane = useMemo(
    () =>
      timed.map((placements, column) => {
        const lane = behind[column]!;
        const keys = new Set<string>();
        for (const stack of stacksOf(placements)) {
          if (stack.some((placed) => lane.some((back) => back.top < placed.bottom && back.bottom > placed.top))) for (const placed of stack) keys.add(placed.key);
        }
        return keys;
      }),
    [timed, behind],
  );
  const coveredAt = (column: number, from: number) => timed[column]!.some((placed) => placed.top < from + slotMinutes && placed.bottom > from);

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
          {start ? (
            <>
              {" "}
              <span dir="ltr" data-slot="time-grid-event-time-inline" className={`${mutedClass} [unicode-bidi:isolate]`}>{formats.time.format(start)}</span>
            </>
          ) : null}
        </span>
      ) : (
        // A space between the lines, which a column doesn't draw, keeps them separate words in the
        // event's visible text, as its name says them (WCAG 2.5.3, Label in Name).
        <>
          <span dir="auto" className="line-clamp-(--ouro-lines) font-medium @max-[6rem]/event:block @max-[6rem]/event:truncate" style={{ "--ouro-lines": Math.max(1, lines - (lines >= 3 && event.description ? 2 : 1)) } as CSSProperties}>
            {event.title}
          </span>{" "}
          <span dir="ltr" data-slot="time-grid-event-time" className={`${mutedLineClass} [unicode-bidi:isolate] rtl:text-end`}>
            {rangeText(formats.time, start!, end!)}
          </span>
          {lines >= 3 && event.description ? (
            <>
              {" "}
              <span dir="auto" className={mutedLineClass}>
                {event.description}
              </span>
            </>
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
      "aria-haspopup": event.id === expandedId ? ("dialog" as const) : undefined,
      className: cn(
        eventClass,
        eventHitClass,
        bar ? backgroundBarClass : [status === "away" ? awayBarClass : toneBarClass[tone], background ? backgroundFillClass : status === "away" ? awayFillClass : status === "busy" ? toneFillClass[tone] : plainFillClass, statusClass[status]],
        placed ? (bar ? timedBarClass : timedClass) : allDayClass,
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
          <span aria-hidden="true" data-ouro-time-grid-bar="" className={cn(backgroundBarFillClass, status === "away" ? awaySwatchClass : toneSwatchClass[tone], barStatusClass[status])} />
        ) : (
          <span className="@container/text flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden @max-[2rem]/text:*:invisible">{content}</span>
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
            <span className="block tabular-nums">
              <span dir="ltr" data-slot="time-grid-event-time-tip" className="[unicode-bidi:isolate]">{rangeText(formats.time, start!, end!)}</span>
            </span>
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
  const placedItems = (placements: ReadonlyArray<DayPlacement<string>>, clearOfLane?: ReadonlySet<string>, stepped = true) =>
    placements.map((placed) => {
      const share = 100 / placed.columns;
      // Beside a chip that folds the events it has no room for, the day is that much narrower.
      const whole = reserved.has(placed.key) ? `calc(100% - ${chipWidth})` : "100%";
      const wholeQ = reserved.has(placed.key) ? `calc(100cqw - ${chipWidth})` : "100cqw";
      const cleared = clearOfLane?.has(placed.key);
      // Where a background event shares its time, the event is placed in what the lane leaves free.
      const free = "(100% - var(--ouro-time-grid-lane))";
      // A day too narrow to give each of its overlapping events a readable width lets them overlap in steps, each later one on top of the last, instead of splitting the width into slivers.
      const step = `max(0.75rem, min(${share / 100} * ${whole}, (${whole} - ${overlapMinWidth}) / ${Math.max(placed.columns - 1, 1)}))`;
      const startAt = !stepped ? `${placed.column * share}%` : placed.columns > 1 ? `calc(${step} * ${placed.column})` : "0%";
      const widthAt = !stepped ? `${placed.span * share}%` : placed.columns > 1 ? `min(max(${(placed.span * share) / 100} * ${whole}, ${overlapMinWidth}), ${whole} - ${startAt})` : whole;
      // The text of an event a later one steps over ends where that one starts, so it is never drawn under another event.
      // Stryker disable next-line EqualityOperator: a freed column is reused, so an event in a later column never merely touches this one, so no filter operand, and no single-column or filter-less case, changes which event covers this one, and < against <= and > against >= place the same events. The stepped test below pins the rest.
      const coveredBy = stepped ? placements.filter((other) => other.column > placed.column && other.top < placed.bottom && other.bottom > placed.top).sort((one, two) => one.column - two.column)[0] : undefined;
      const unit = `max(0.75rem, min(${share / 100} * ${wholeQ}, (${wholeQ} - ${overlapMinWidth}) / ${placed.columns - 1}))`;
      // Stryker disable next-line ArithmeticOperator: width only feeds the cover, and a covered event has an overlapping later column, which stops its span at 1, so span * share and span / share agree.
      const width = `min(max(${(placed.span * share) / 100} * ${wholeQ}, ${overlapMinWidth}), ${wholeQ} - ${unit} * ${placed.column})`;
      // Padding and borders must still fit the button, or it would spill out of its place.
      const cover = coveredBy ? `max(0px, min(${width} - ${unit} * ${coveredBy.column - placed.column} - 0.875rem, ${width} - 2rem))` : undefined;
      return (
        <li
          key={placed.key}
          className="pointer-events-auto absolute"
          data-ouro-allow="near-miss"
          data-ouro-allow-why="An event sits where its time puts it, so events that start and end together touch."
          style={{
            top: minutesTall(placed.top),
            height: `calc(${minutesTall(placed.bottom - placed.top)} - 1px)`,
            ...(cover ? { "--ouro-time-grid-cover": cover } : {}),
            insetInlineStart: cleared ? `calc(var(--ouro-time-grid-lane) + ${free} * ${placed.column / placed.columns})` : startAt,
            width: cleared ? `calc(${free} * ${placed.span / placed.columns})` : widthAt,
          }}
        >
          {renderEvent(pieces.find((piece) => piece.key === placed.key)!, placed)}
        </li>
      );
    });

  // The time from the earliest start to the latest end of some events.
  const membersRange = (members: ReadonlyArray<{ event: TimeGridEvent }>) =>
    rangeText(formats.time, new Date(Math.min(...members.map((piece) => toInstant(piece.event.start)!.getTime()))), new Date(Math.max(...members.map((piece) => toInstant(piece.event.end!)!.getTime()))));

  // A stack of a day's background events drawn as one: their count and their time, which opens
  // their list, each item choosing its event as a press on it would.
  const stackItem = (stack: ReadonlyArray<DayPlacement<string>>, background = true, clearOfLane = false) => {
    const members = stack.map((placed) => pieces.find((piece) => piece.key === placed.key)!);
    const key = stack[0]!.key;
    const top = Math.min(...stack.map((placed) => placed.top));
    const bottom = Math.max(...stack.map((placed) => placed.bottom));
    const element = () => rootRef.current!.querySelector<HTMLElement>(`[data-ouro-event-key="${CSS.escape(key)}"]`)!;
    return (
      <li
        key={key}
        className="pointer-events-auto absolute end-0 start-0"
        style={{ top: minutesTall(top), height: `calc(${minutesTall(bottom - top)} - 1px)`, ...(clearOfLane ? { insetInlineStart: "var(--ouro-time-grid-lane)" } : {}) }}
      >
        <Menu
          side="right"
          trigger={
            <button
              type="button"
              data-ouro-control="time-grid"
              data-ouro-part="stack"
              data-ouro-event-key={key}
              data-background={background ? "" : undefined}
              tabIndex={key === tabStop ? 0 : -1}
              aria-label={`${stackLabel(stack.length)} ${membersRange(members)}`}
              aria-current={members.some((piece) => piece.event.id === selectedId) ? "true" : undefined}
              // The arrows move through the grid, as from any event; Enter and Space press it, which opens the list.
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => (event as typeof event & { preventBaseUIHandler: () => void }).preventBaseUIHandler()}
              onFocus={() => setActive(key)}
              className={cn(eventClass, eventHitClass, toneBarClass.secondary, backgroundFillClass, statusClass.busy, timedClass, "z-[9]")}
            >
              <TouchTarget />
              <span className="@container/text flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden @max-[2rem]/text:*:invisible">
                <span className="truncate font-medium">{stackLabel(stack.length)}</span>{" "}
                <span dir="ltr" data-slot="time-grid-stack-time" className={`${mutedLineClass} [unicode-bidi:isolate]`}>{membersRange(members)}</span>
              </span>
            </button>
          }
        >
          {members.map((piece) => (
            <MenuItem key={piece.key} href={piece.event.href} onClick={() => onEventSelect?.(piece.event, { element: element(), background })}>
              <span dir="auto">{piece.event.title}</span>
              <span className={mutedClass}> {rangeText(formats.time, toInstant(piece.event.start)!, toInstant(piece.event.end!)!)}</span>
            </MenuItem>
          ))}
        </Menu>
      </li>
    );
  };

  // The events a day has no room to show, folded into a chip in a strip at the day's end, which opens their list.
  const chipItem = (folded: ReadonlyArray<DayPlacement<string>>) => {
    const members = folded.map((placed) => pieces.find((piece) => piece.key === placed.key)!);
    const key = folded[0]!.key;
    const top = Math.min(...folded.map((placed) => placed.top));
    const bottom = Math.max(...folded.map((placed) => placed.bottom));
    const element = () => rootRef.current!.querySelector<HTMLElement>(`[data-ouro-event-key="${CSS.escape(key)}"]`)!;
    return (
      <li key={key} data-slot="time-grid-more-item" className="pointer-events-auto absolute end-0" style={{ top: minutesTall(top), height: `calc(${minutesTall(bottom - top)} - 1px)`, width: chipWidth }}>
        <Menu
          side="right"
          className="max-w-xs"
          trigger={
            <button
              type="button"
              data-ouro-control="time-grid"
              data-ouro-part="more"
              data-slot="time-grid-more"
              data-ouro-event-key={key}
              tabIndex={key === tabStop ? 0 : -1}
              aria-label={`${moreLabel(members.length)} ${membersRange(members)}`}
              aria-current={members.some((piece) => piece.event.id === selectedId) ? "true" : undefined}
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => (event as typeof event & { preventBaseUIHandler: () => void }).preventBaseUIHandler()}
              onFocus={() => setActive(key)}
              className={cn(eventClass, eventHitClass, toneBarClass.secondary, backgroundFillClass, statusClass.busy, timedClass, "inset-x-0 z-[9] items-start justify-center whitespace-nowrap px-0 text-center")}
            >
              <TouchTarget />
              <span aria-hidden="true" data-slot="time-grid-more-count" className="min-w-0 font-medium">{`+${members.length}`}</span>
            </button>
          }
        >
          {members.map((piece) => (
            <MenuItem key={piece.key} href={piece.event.href} onClick={() => onEventSelect?.(piece.event, { element: element(), background: false })}>
              <span dir="auto" data-slot="time-grid-menu-title" className="min-w-0 flex-1 truncate">{piece.event.title}</span>
              <span dir="ltr" data-slot="time-grid-menu-time" className={`${mutedClass} shrink-0 ps-2 [unicode-bidi:isolate]`}>{rangeText(formats.time, toInstant(piece.event.start)!, toInstant(piece.event.end!)!)}</span>
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
        "relative box-border flex h-ouro-144 min-h-0 min-w-0 flex-col text-foreground",
        "[--ouro-time-grid-gutter:4rem] [--ouro-time-grid-hour:max(3rem,var(--ouro-time-grid-fill,0px))] [--ouro-time-grid-tint:14%] pointer-coarse:[--ouro-time-grid-hour:max(3.5rem,var(--ouro-time-grid-fill,0px))] dark:[--ouro-time-grid-tint:24%]",
        className,
      )}
      style={
        {
          ...(renderDaySummary ? {} : { "--ouro-time-grid-head": `${4.25 + lanes * 1.5}rem` }),
          "--ouro-time-grid-lane": labelBackground ? "max(7rem, 40%)" : "0.75rem",
          ...style,
        } as CSSProperties
      }
      onKeyDown={onKeyDown}
    >
      <ScrollArea label={label} className="min-h-0 flex-1">
        <div data-ouro-time-grid-head="" className="sticky top-0 z-40 grid border-0 border-b border-solid border-transparent bg-transparent transition-[background-color,border-color] duration-(--ouro-duration-fast) [[data-overflow-y-start]_&]:border-border [[data-overflow-y-start]_&]:bg-background/95 [[data-overflow-y-start]_&]:backdrop-blur-lg [[data-overflow-y-start]_&]:[@media(prefers-reduced-transparency:reduce)]:bg-background [[data-overflow-y-start]_&]:[@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none [[data-overflow-y-start]_&]:contrast-more:bg-background [[data-overflow-y-start]_&]:contrast-more:backdrop-blur-none" style={{ gridTemplateColumns: columns }}>
          <div aria-hidden="true" />
          {days.map((day, index) => (
            <div
              key={day}
              aria-hidden="true"
              data-today={index === todayIndex ? "" : undefined}
              data-ouro-time-grid-marked={markOf(day) ? "" : undefined}
              className="group/day @container/day min-w-0 border-0 border-s border-solid border-border"
              style={markOf(day)?.style}
            >
              <span className="flex min-w-0 items-center gap-1.5 overflow-hidden px-2 py-1.5 @max-[5.5rem]/day:flex-col @max-[5.5rem]/day:gap-0.5 @max-[5.5rem]/day:px-0.5">
              <span className="inline-flex size-ouro-7 shrink-0 items-center justify-center rounded-full text-base leading-none font-semibold tabular-nums group-data-today/day:bg-primary group-data-today/day:text-primary-foreground forced-colors:group-data-today/day:border-2 forced-colors:group-data-today/day:border-solid">
                {
                  // Stryker disable next-line ConditionalExpression: in the locales tested the day comes first; the search is for one where it does not
                  formats.dayNumber.formatToParts(utcDate(day)).find((part) => part.type === "day")!.value
                }
              </span>
              <span className={`truncate text-xs ${markedMutedClass} group-data-today/day:font-medium group-data-today/day:text-foreground`}>{formats.weekdayShort.format(utcDate(day))}</span>
              </span>
              {markOf(day) ? <span data-ouro-time-grid-mark="" data-slot="time-grid-mark-label" className={`block truncate px-2 pb-1 text-xs ${markedMutedClass} @max-[5.5rem]/day:px-0.5`}>{markOf(day)!.label}</span> : null}
            </div>
          ))}
          {renderDaySummary ? (
            <>
              <div aria-hidden="true" />
              {days.map((day) => (
                <div key={day} role="group" aria-label={[formats.fullDay.format(utcDate(day)), markOf(day)?.label].filter(Boolean).join(", ")} data-ouro-time-grid-summary="" className={`min-w-0 border-0 border-s border-solid border-border px-2 pb-1 text-xs ${markOf(day) ? markedMutedClass : "text-muted-foreground"}`} style={markOf(day)?.style}>
                  {renderDaySummary(day)}
                </div>
              ))}
            </>
          ) : null}
          <div aria-hidden="true" className="flex items-start justify-end py-1 pe-2 text-[11px] leading-5 text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]">
            {allDayLabel}
          </div>
          {allDay.length > 0 ? (
            <ul
              role="list"
              aria-label={allDayLabel}
              className="m-0 grid list-none auto-rows-[1.375rem] gap-y-0.5 p-0 py-2"
              style={{ gridColumn: "2 / -1", gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))`, minHeight: `${lanes * 1.5 + 1.25}rem` }}
            >
              {allDay.map((span) => (
                <li key={span.key} className="min-w-0 px-2" style={{ gridColumn: `${span.first + 1} / ${span.last + 2}`, gridRow: span.lane + 1 }}>
                  {renderEvent(pieces.find((piece) => piece.key === span.key)!)}
                </li>
              ))}
            </ul>
          ) : (
            <div aria-hidden="true" style={{ minHeight: "2rem" }} />
          )}
        </div>
        <div data-ouro-time-grid-body="" className="relative grid" style={{ gridTemplateColumns: columns, height: minutesTall(dayLength) }}>
          {onSlotSelect && days.length > 0 ? (
            <div
              role="grid"
              tabIndex={0}
              aria-label={slotsLabel}
              aria-activedescendant={cursorId}
              data-ouro-control="time-grid"
              data-ouro-part="slots"
              data-slot="time-grid-slots"
              className="pointer-events-none absolute inset-0 outline-ring -outline-offset-2 focus-visible:outline-2"
              onFocus={() => setCursor((now) => now ?? cursorStart())}
              onBlur={() => setCursor(null)}
              onKeyDown={onSlotKeyDown}
            >
              <div role="row" data-slot="time-grid-slots-row">
                {cursor ? (
                  <div role="gridcell" key={cursorId} id={cursorId} data-slot="time-grid-slots-cell" className="sr-only">
                    {`${formats.fullDay.format(utcDate(days[cursor.day]!))}, ${formats.time.format(formats.clock.instant(days[cursor.day]!, cursor.minutes))}`}
                  </div>
                ) : (
                  <div role="gridcell" data-slot="time-grid-slots-cell" className="sr-only">
                    {slotsLabel}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          <div aria-hidden="true" className="relative">
            {hourLabels.map((hour) => (
              <span key={hour} data-slot="time-grid-hour-label" className="absolute end-2 -translate-y-1/2 text-[11px] leading-4 whitespace-nowrap text-muted-foreground tabular-nums" style={{ top: minutesTall(hour * 60) }}>
                <bdi dir="ltr" data-slot="time-grid-hour-text">{formats.hour.format(Date.UTC(2026, 0, 1, hour))}</bdi>
              </span>
            ))}
            {nowAt && todayIndex >= 0 ? (
              <span data-ouro-time-grid-now-label="" className="absolute end-1 flex -translate-y-1/2 flex-col items-end gap-0.5" style={{ top: nowTop }}>
                {nowAdornment ? <span className="absolute end-0 bottom-full mb-0.5">{nowAdornment}</span> : null}
                <span dir="ltr" data-slot="time-grid-now-text" className="[unicode-bidi:isolate] rounded-ouro-sm bg-background px-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap text-destructive tabular-nums">
                  {nowText}
                </span>
              </span>
            ) : null}
          </div>
          {days.map((day, index) => {
            const off = weekend.includes(utcDate(day).getUTCDay());
            return (
              <div key={day} data-ouro-time-grid-day="" data-slot="time-grid-day" className="relative @container/col min-w-0 border-0 border-s border-solid border-border">
                <div aria-hidden="true" data-slot="time-grid-lines" className="pointer-events-none absolute inset-0">
                  {hourLines.map((line) => (
                    <span key={line.at} data-slot="time-grid-line" className={line.half ? halfHourLineClass : hourLineClass} style={{ top: minutesTall(line.at) }} />
                  ))}
                </div>
                {off ? (
                  <div aria-hidden="true" data-ouro-time-grid-off="" className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]" />
                ) : (
                  <>
                    <div aria-hidden="true" data-ouro-time-grid-off="" className="pointer-events-none absolute inset-x-0 top-0 bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]" style={{ height: minutesTall(workingHours.start * 60) }} />
                    <div aria-hidden="true" data-ouro-time-grid-off="" className="pointer-events-none absolute inset-x-0 bottom-0 bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]" style={{ top: minutesTall(workingHours.end * 60) }} />
                  </>
                )}
                {markOf(day) ? (
                  <div data-ouro-time-grid-mark="" data-slot="time-grid-mark" className="pointer-events-none absolute inset-0" style={markOf(day)!.style}>
                    <span data-slot="time-grid-mark-name" className="sr-only">{`${formats.fullDay.format(utcDate(day))}, ${markOf(day)!.label}`}</span>
                  </div>
                ) : null}
                {onSlotSelect ? (
                  <div
                    aria-hidden="true"
                    data-ouro-time-grid-slots=""
                    className="absolute inset-0 cursor-cell select-none"
                    onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
                      // A drag that ended outside the layer leaves no click to clear this, so every press does.
                      dragged.current = false;
                      if (event.pointerType !== "mouse" || event.button !== 0) return;
                      const minutes = slotAt(event);
                      setDrag({ day: index, from: minutes, to: minutes });
                      try {
                        event.currentTarget.setPointerCapture(event.pointerId);
                      } catch {
                        // A pointer that has already gone can't be captured; the drag still follows the moves it gets.
                      }
                    }}
                    onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
                      if (drag?.day === index) setDrag({ ...drag, to: slotAt(event) });
                      setHover(event.pointerType === "mouse" ? { day: index, minutes: slotAt(event) } : null);
                    }}
                    onPointerUp={(event: PointerEvent<HTMLDivElement>) => {
                      if (drag?.day !== index) return;
                      const to = slotAt(event);
                      setDrag(null);
                      if (to === drag.from) return;
                      dragged.current = true;
                      const first = Math.min(drag.from, to);
                      const last = Math.max(drag.from, to) + slotMinutes;
                      onSlotSelect({ start: formats.clock.instant(day, first), end: formats.clock.instant(day, last) });
                    }}
                    onPointerCancel={() => setDrag(null)}
                    onPointerLeave={() => setHover(null)}
                    onClick={(event) => {
                      if (dragged.current) {
                        dragged.current = false;
                        return;
                      }
                      const minutes = slotAt(event);
                      onSlotSelect({ start: formats.clock.instant(day, minutes), end: formats.clock.instant(day, minutes + slotMinutes) });
                    }}
                  >
                    {cursor?.day === index ? (
                      <span
                        ref={cursorRef}
                        aria-hidden="true"
                        data-slot="time-grid-cursor"
                        data-ouro-time-grid-slot=""
                        data-ouro-time-grid-cursor=""
                        className="pointer-events-none absolute inset-x-0.5 box-border rounded-ouro-md border-2 border-solid border-primary bg-primary/10 px-1.5 text-[11px] leading-4 text-foreground forced-colors:border-[Highlight]"
                        style={{ top: minutesTall(cursor.minutes), height: minutesTall(slotMinutes) }}
                      >
                        {formats.time.format(formats.clock.instant(day, cursor.minutes))}
                      </span>
                    ) : null}
                    {drag?.day === index && drag.to !== drag.from ? (
                      <span
                        data-ouro-time-grid-drag=""
                        data-slot="time-grid-drag"
                        className="pointer-events-none absolute inset-x-0.5 box-border rounded-ouro-md border border-solid border-primary bg-primary/10"
                        style={{ top: minutesTall(Math.min(drag.from, drag.to)), height: minutesTall(Math.abs(drag.to - drag.from) + slotMinutes) }}
                      />
                    ) : null}
                    {hover?.day === index && !coveredAt(index, hover.minutes) ? (
                      <span
                        data-ouro-time-grid-slot=""
                        className={cn(
                          "pointer-events-none absolute box-border rounded-ouro-md border border-dashed border-primary px-1.5 text-[11px] leading-4 text-muted-foreground",
                          behind[index]!.some((back) => back.top < hover.minutes + slotMinutes && back.bottom > hover.minutes) ? "start-(--ouro-time-grid-lane) ms-0.5 end-0.5" : "inset-x-0.5",
                        )}
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
                    {index === todayIndex ? <span className="absolute -start-ouro-1_5 -top-ouro-1_5 size-ouro-2_5 rounded-full bg-destructive forced-colors:bg-[CanvasText]" /> : null}
                  </div>
                ) : null}
                {timed[index]!.length > 0 ? (
                  <ul
                    role="list"
                    aria-label={[formats.fullDay.format(utcDate(day)), markOf(day)?.label].filter(Boolean).join(", ")}
                    aria-current={index === todayIndex ? "date" : undefined}
                    className="pointer-events-none absolute inset-0 m-0 list-none p-0"
                  >
                    {placedItems(shown[index]!, clearOfLane[index])}
                    {folds[index]!.map((fold) => (fold.shown.length > 0 ? chipItem(fold.folded) : stackItem(fold.folded, false, clearOfLane[index]!.has(fold.folded[0]!.key))))}
                  </ul>
                ) : null}
                {behind[index]!.length > 0 ? (
                  <ul
                    role="list"
                    aria-label={`${formats.fullDay.format(utcDate(day))}, ${backgroundLabel}`}
                    data-ouro-time-grid-background=""
                    className="pointer-events-none absolute inset-y-0 start-0 m-0 box-border w-(--ouro-time-grid-lane) list-none p-0"
                  >
                    {placedItems(behind[index]!.filter((placed) => !stackOf.has(placed.key)), undefined, false)}
                    {stacks[index]!.map((stack) => stackItem(stack))}
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
