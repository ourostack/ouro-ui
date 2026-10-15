"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type JSX, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ouro/button/button";
import { useAppearanceClassNameCheck } from "@/lib/ouro/class-name-check";
import { cn } from "@/lib/ouro/cn";
import { useDevWarnings } from "@/lib/ouro/use-dev-messages";
import {
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
  type DateRange,
} from "@/components/ouro/calendar/calendar-styles";

export type { DateRange };

/** The props both of Calendar's modes take. */
export interface CalendarBaseProps {
  /**
   * What the dates are for, read by screen readers as the calendar's name: `"Delivery date"`.
   * Required, because a grid of numbers says nothing on its own. It is not shown; put a
   * visible heading beside the calendar if the page needs one.
   */
  label: string;
  /** The earliest day the user can pick, as an ISO date: `min="2026-10-11"`. Earlier days are unavailable. */
  min?: string | undefined;
  /** The latest day the user can pick, as an ISO date: `max="2026-12-31"`. Later days are unavailable. */
  max?: string | undefined;
  /**
   * Marks single days unavailable: `isDateDisabled={(date) => booked.has(date)}`. It gets each
   * day as an ISO date. Unavailable days stay in the arrow-key path, so screen readers still
   * hear them, but cannot be picked.
   */
  isDateDisabled?: ((date: string) => boolean) | undefined;
  /**
   * The BCP 47 locale for the month and weekday names, the digits and the first day of the
   * week: `"en-GB"` starts weeks on Monday, `"en-US"` on Sunday. Pass your app's locale; the
   * default is the same on the server and in the browser, so hydration matches.
   * @default "en-US"
   */
  locale?: string | undefined;
  /** The month shown first, as any ISO date in it. Without it, the selected date's month, or today's. */
  defaultMonth?: string | undefined;
  /**
   * The previous month button's label. Translate it with your app.
   * @default "Previous month"
   */
  previousMonthLabel?: string | undefined;
  /**
   * The next month button's label. Translate it with your app.
   * @default "Next month"
   */
  nextMonthLabel?: string | undefined;
  /**
   * Layout only: margins and grid placement (`mt-4`). Appearance classes warn in
   * development; the calendar takes its colors from your theme.
   */
  className?: string | undefined;
  /** The calendar's root element. */
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Ouro UI uses `value`: `<Calendar value={date} onValueChange={setDate}>`. */
  selected?: { 'Use value={date} onValueChange={setDate}': never };
  /** Not a prop. Ouro UI uses `onValueChange`: `<Calendar value={date} onValueChange={setDate}>`. */
  onSelect?: { 'Use value={date} onValueChange={setDate}': never };
  /** Not a prop. Ouro UI uses `onValueChange`, which gets the ISO date: `<Calendar onValueChange={setDate}>`. */
  onChange?: { 'Use onValueChange={setDate}; it gets the ISO date': never };
  /** Not a prop. Ouro UI uses `min`: `<Calendar min="2026-10-11">`. */
  minDate?: { 'Use min="2026-10-11"': never };
  /** Not a prop. Ouro UI uses `max`: `<Calendar max="2026-12-31">`. */
  maxDate?: { 'Use max="2026-12-31"': never };
  /** Not a prop. The locale sets the first day of the week: `<Calendar locale="en-GB">`, or `"en-US-u-fw-mon"`. */
  weekStartsOn?: { 'The locale sets it: locale="en-GB" or "en-US-u-fw-mon"': never };
  /** Not a prop. Ouro UI uses `range` for a range; one day is the default: `<Calendar range>`. */
  mode?: { 'Use <Calendar range> for a range; one day is the default': never };
  /** Not a prop. Ouro UI uses `isDateDisabled`: `<Calendar isDateDisabled={(date) => booked.has(date)}>`. */
  disabled?: { 'Use isDateDisabled={(date) => booked.has(date)}': never };
}

/** What a Calendar picks: an ISO date, or with `range` a {@link DateRange}. */
export type CalendarValue<Range extends boolean> = Range extends true ? DateRange : string;

/**
 * Props for {@link Calendar}. `range` sets the mode: without it the value is one ISO date,
 * with it a `{ start, end }` range. A wrapper component should take `CalendarProps<false>` or
 * `CalendarProps<true>`; `ComponentProps<typeof Calendar>` loses the link between `range` and `value`.
 */
export type CalendarProps<Range extends boolean = false> = CalendarBaseProps & {
  /**
   * Picks a range: the first press sets the start, the second the end, and Escape drops a
   * start. A range never spans an unavailable day: the preview and the end stop at the last
   * available day before it, so a stay cannot include a booked night. Without `range` the
   * calendar picks one day.
   */
  range?: Range | undefined;
  /**
   * The picked day as an ISO date (`"2026-10-11"`, `""` for none). With `range` it is the
   * picked `{ start, end }` instead (`null` for none), and passing `{ start, end }` without
   * `range` is a type error. Pass it with `onValueChange` to control the calendar.
   */
  value?: (Range extends true ? DateRange | null : string) | undefined;
  /** What is picked at first, when you do not control `value`: an ISO date, or with `range` a `{ start, end }`. */
  defaultValue?: (Range extends true ? DateRange | null : string) | undefined;
  /** Called when the user picks: with the ISO date, or with `range` the `{ start, end }` in order once both ends are picked. */
  onValueChange?: ((value: CalendarValue<Range>) => void) | undefined;
};

/** Today never changes while a page is open in a way the calendar must follow at once, so there is nothing to subscribe to. */
const noSubscription = () => () => {};
/** The server does not know the user's zone, so it knows no today. */
const serverToday = (): string | null => null;

/** Arrow keys move by these many days, in a left-to-right layout. */
const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/** The range a value or a pending selection covers, ends in order. */
function ordered(a: string, b: string): DateRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** Icons drawn in the text color at 16px, like the other Ouro icons. */
function Chevron({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 rtl:-scale-x-100"
    >
      {children}
    </svg>
  );
}

/**
 * A month grid to pick a day or a range of days, with the arrow keys or a press. It follows
 * the ARIA grid pattern: one Tab stop, arrows move by day and week, Home and End to the
 * week's ends, Page Up and Page Down by month (with Shift, by year), and Enter or Space
 * picks. Month and weekday names, digits and the first day of the week come from `locale`
 * through `Intl.DateTimeFormat`. Values are ISO dates (`"2026-10-11"`), the format a date
 * input submits.
 *
 * Use `DatePicker` instead for a date in a form: it is a labeled field that opens this
 * calendar on desktops and the phone's own picker on touch screens.
 *
 * @group Forms
 * @see https://ourostack.github.io/ouro-ui/docs/calendar
 *
 * @example
 * <Calendar label="Delivery date" value={date} onValueChange={setDate} min="2026-10-11" />
 * <Calendar label="Trip" range value={trip} onValueChange={setTrip} locale="en-GB" />
 * <Calendar label="Booking" isDateDisabled={(date) => booked.has(date)} />
 */
export function Calendar<Range extends boolean = false>(props: CalendarProps<Range>): JSX.Element {
  const {
    label,
    min,
    max,
    isDateDisabled,
    locale = "en-US",
    defaultMonth,
    previousMonthLabel = "Previous month",
    nextMonthLabel = "Next month",
    className,
    ref,
    range,
    value,
    defaultValue,
    onValueChange,
    // Guard props (hint types), dropped here so they never reach the DOM.
    selected: selectedGuess,
    onSelect,
    onChange,
    minDate,
    maxDate,
    weekStartsOn,
    mode,
    disabled,
  } = props as unknown as CalendarBaseProps & {
    range?: boolean;
    value?: string | DateRange | null;
    defaultValue?: string | DateRange | null;
    onValueChange?: (value: string | DateRange) => void;
  };

  useAppearanceClassNameCheck(
    "Calendar",
    className,
    process.env.NODE_ENV !== "production" ? calendarHint("Calendar") : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Calendar",
    process.env.NODE_ENV !== "production"
      ? () => {
          const dates: Array<[string, unknown]> = [
            ["min", min],
            ["max", max],
            ["defaultMonth", defaultMonth],
          ];
          for (const [prop, given] of [
            ["value", value],
            ["defaultValue", defaultValue],
          ] as const) {
            if (given && typeof given === "object") dates.push([`${prop}.start`, given.start], [`${prop}.end`, given.end]);
            else dates.push([prop, given]);
          }
          return [
            !label && ["label is required; it names the calendar for screen readers", '<Calendar label="Delivery date">'],
            ...dates.map(([prop, given]) => given !== undefined && given !== null && given !== "" && !isIsoDate(given) && isoWarning("Calendar", prop, given)),
            range === true && typeof (value ?? defaultValue) === "string" && [
              "a range takes { start, end }, not one date",
              '<Calendar range value={{ start: "2026-10-11", end: "2026-10-14" }}>',
            ],
            selectedGuess !== undefined && ["selected is not a prop", "<Calendar value={date} onValueChange={setDate}>"],
            onSelect !== undefined && ["onSelect is not a prop", "<Calendar value={date} onValueChange={setDate}>"],
            onChange !== undefined && ["onChange is not a prop; onValueChange gets the ISO date", "<Calendar onValueChange={setDate}>"],
            minDate !== undefined && ["minDate is not a prop", '<Calendar min="2026-10-11">'],
            maxDate !== undefined && ["maxDate is not a prop", '<Calendar max="2026-12-31">'],
            weekStartsOn !== undefined && ["weekStartsOn is not a prop; the locale sets the first day", '<Calendar locale="en-GB">, or locale="en-US-u-fw-mon"'],
            mode !== undefined && ["mode is not a prop", String(mode) === "range" ? "<Calendar range>" : "<Calendar>, which picks one day"],
            disabled !== undefined && ["disabled is not a prop", "<Calendar isDateDisabled={(date) => booked.has(date)}>"],
          ];
        }
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const isRange = range === true;
  // Values that are not ISO dates (a dev warning) count as no value.
  const clean = (given: string | DateRange | null | undefined): string | DateRange | null => {
    if (isRange) return given && typeof given === "object" && isIsoDate(given.start) && isIsoDate(given.end) ? ordered(given.start, given.end) : null;
    return isIsoDate(given) ? given : null;
  };
  const [own, setOwn] = useState(() => clean(defaultValue));
  const controlled = value !== undefined;
  const current = controlled ? clean(value) : own;
  const picked = current === null ? null : typeof current === "string" ? { start: current, end: current } : current;

  const low = isIsoDate(min) ? min : undefined;
  const high = isIsoDate(max) ? max : undefined;
  const clamp = (iso: string) => (low && iso < low ? low : high && iso > high ? high : iso);
  const unavailable = (iso: string) => (low !== undefined && iso < low) || (high !== undefined && iso > high) || Boolean(isDateDisabled?.(iso));

  // Today in the browser's zone. The server and hydration see `null`, so the server HTML marks
  // no day as today and hydration matches wherever the server runs; the browser then fills it in.
  const today = useSyncExternalStore(noSubscription, todayIso, serverToday);
  // The day with the Tab stop; the month on show is its month. Without a value or
  // `defaultMonth` it is today, so the server renders an empty month until hydration.
  const [chosen, setFocused] = useState<string | null>(() => {
    const start = isIsoDate(defaultMonth) ? monthStart(defaultMonth) : picked?.start;
    return start === undefined ? null : clamp(start);
  });
  const focused = chosen ?? (today === null ? null : clamp(today));
  // A new value from the app shows its month.
  const pickedStart = picked?.start;
  const [shownStart, setShownStart] = useState(pickedStart);
  if (pickedStart !== shownStart) {
    setShownStart(pickedStart);
    if (pickedStart !== undefined && (focused === null || monthStart(pickedStart) !== monthStart(focused))) setFocused(pickedStart);
  }

  // A range's first press waits here for the second; the day under the pointer or focus previews the end.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // The preview is set with the anchor, so it is never null while there is one.
  const shown = anchor !== null ? ordered(anchor, preview!) : picked;

  const firstDay = useMemo(() => firstDayOfWeek(locale), [locale]);
  const formats = useMemo(
    () => ({
      title: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }),
      day: new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }),
      full: new Intl.DateTimeFormat(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
      weekdayShort: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }),
      weekdayLong: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }),
    }),
    [locale],
  );
  const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

  const month = focused === null ? null : monthStart(focused);
  const weeks = month === null ? [] : monthGrid(month, firstDay);
  // 2023-01-01 was a Sunday: the header's days, from the first day of the week.
  const weekdays = Array.from({ length: 7 }, (_, index) => utc(addDays("2023-01-01", (firstDay + index) % 7)));
  const canGoBack = month !== null && (!low || addDays(month, -1) >= low);
  const canGoForward = month !== null && (!high || addMonths(month, 1) <= high);

  const id = useId();
  const titleId = `${id}-title`;
  const gridRef = useRef<HTMLTableElement>(null);
  // Set when a key moves the Tab stop, so the effect moves focus with it.
  const moveFocus = useRef(false);
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current!.querySelector<HTMLElement>(`[data-ouro-day="${focused}"]`)!.focus();
  }, [focused]);

  // The month buttons move the Tab stop a month. A button the move disables would drop
  // focus to the page, so focus goes to the day instead.
  const turn = (count: number) => {
    const next = clamp(addMonths(focused!, count));
    const shownMonth = monthStart(next);
    if (count < 0 ? low && addDays(shownMonth, -1) < low : high && addMonths(shownMonth, 1) > high) moveFocus.current = true;
    setFocused(next);
  };

  // A range never spans an unavailable day: from its start, it reaches toward `to` only up
  // to the day before the first unavailable one.
  const reach = (from: string, to: string) => {
    const step = to >= from ? 1 : -1;
    for (let day = from; day !== to; day = addDays(day, step)) {
      if (unavailable(addDays(day, step))) return day;
    }
    return to;
  };

  const pick = (iso: string) => {
    setFocused(iso);
    if (unavailable(iso)) return;
    if (!isRange) {
      if (!controlled) setOwn(iso);
      onValueChange?.(iso);
      return;
    }
    if (anchor === null) {
      setAnchor(iso);
      setPreview(iso);
      return;
    }
    const next = ordered(anchor, reach(anchor, iso));
    setAnchor(null);
    setPreview(null);
    if (!controlled) setOwn(next);
    onValueChange?.(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (event.key === "Escape" && anchor !== null) {
      // Escape drops a range's pending start; with none, it is left to an enclosing popover.
      event.preventDefault();
      setAnchor(null);
      setPreview(null);
      return;
    }
    const day = (event.target as HTMLElement).dataset.ouroDay!;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    let next: string | undefined;
    if (Object.hasOwn(steps, event.key)) {
      const step = steps[event.key]!;
      next = addDays(day, rtl && Math.abs(step) === 1 ? -step : step);
    } else if (event.key === "Home" || event.key === "End") {
      const column = (utc(day).getUTCDay() - firstDay + 7) % 7;
      next = addDays(day, event.key === "Home" ? -column : 6 - column);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      next = addMonths(day, (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1));
    }
    if (next === undefined) return;
    event.preventDefault();
    const target = clamp(next);
    if (anchor !== null) setPreview(reach(anchor, target));
    moveFocus.current = true;
    setFocused(target);
  };

  return (
    <div ref={ref} role="group" aria-label={label} data-ouro="calendar" className={cn("box-border inline-grid gap-2", className)}>
      <div data-ouro-calendar-header="" className="flex items-center justify-between gap-2">
        <Button
          variant="plain"
          tone="secondary"
          size="sm"
          aria-label={previousMonthLabel}
          disabled={!canGoBack}
          className={navClass}
          onClick={() => turn(-1)}
        >
          <Chevron>
            <path d="M10 3.5L5.5 8l4.5 4.5" />
          </Chevron>
        </Button>
        <h2 id={titleId} aria-live="polite" className="m-0 text-sm leading-5 font-medium text-foreground">
          {month === null ? null : formats.title.format(utc(month))}
        </h2>
        <Button
          variant="plain"
          tone="secondary"
          size="sm"
          aria-label={nextMonthLabel}
          disabled={!canGoForward}
          className={navClass}
          onClick={() => turn(1)}
        >
          <Chevron>
            <path d="M6 3.5L10.5 8 6 12.5" />
          </Chevron>
        </Button>
      </div>
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        aria-multiselectable={isRange || undefined}
        className="m-0 border-collapse border-spacing-0"
        onKeyDown={onKeyDown}
        onPointerLeave={() => anchor !== null && setPreview(anchor)}
      >
        <thead>
          <tr>
            {weekdays.map((date) => (
              <th key={date.getUTCDay()} scope="col" abbr={formats.weekdayLong.format(date)} className={weekdayHeaderClass}>
                {formats.weekdayShort.format(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.find(Boolean)!}>
              {week.map((day, index) => {
                if (day === null) return <td key={`blank-${index}`} className="p-0" />;
                const off = unavailable(day);
                const ends = shown !== null && (day === shown.start || day === shown.end);
                const inside = shown !== null && day > shown.start && day < shown.end;
                return (
                  <td key={day} role="gridcell" aria-selected={ends || inside} className="p-0 text-center">
                    <button
                      type="button"
                      data-ouro-day={day}
                      tabIndex={day === focused ? 0 : -1}
                      aria-label={formats.full.format(utc(day))}
                      aria-current={day === today ? "date" : undefined}
                      aria-disabled={off || undefined}
                      {...(ends ? { "data-selected": "" } : {})}
                      {...(inside ? { "data-in-range": "" } : {})}
                      className={dayClass}
                      onClick={() => pick(day)}
                      onPointerEnter={() => anchor !== null && setPreview(reach(anchor, day))}
                      onFocus={() => anchor !== null && setPreview(reach(anchor, day))}
                    >
                      {formats.day.format(utc(day))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
