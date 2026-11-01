"use client";

import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { addDays } from "@/registry/ouro/components/ouro/calendar/calendar-styles";
import { todayOn, type TimeGridView, zonedClock } from "@/registry/ouro/components/ouro/time-grid/time-grid-styles";

/** Props for {@link TimeGridNav}. */
export interface TimeGridNavProps {
  /** The ISO date the grid shows, as given to its `date`. */
  date: string;
  /** The grid's view, which sets how far Previous and Next move: a day, or a week. @default "week" */
  view?: TimeGridView | undefined;
  /** Called with the ISO date to show. Set the grid's `date` to it. */
  onDateChange: (date: string) => void;
  /** The grid's time zone, whose today Today goes to. @default the reader's own */
  timeZone?: string | undefined;
  /** The buttons' words, for other languages. @default { today: "Today", previous: "Previous week", next: "Next week" }, or "day" for a day's view */
  labels?: { today?: string | undefined; previous?: string | undefined; next?: string | undefined } | undefined;
  /** Layout only: margins and placement. Appearance classes warn in development. */
  className?: string | undefined;
}

const chevron = (d: string) => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 rtl:-scale-x-100">
    <path d={d} />
  </svg>
);

/**
 * Today, Previous and Next for a `TimeGrid`: three buttons that move its `date` by its view's
 * day or week, each with its keyboard shortcut in its tooltip. The grid takes the same keys
 * while focus is in it, with `onDateChange`: Page Up and ⌥↑ (Alt+↑) the period before, Page
 * Down and ⌥↓ the next, ⌥⇧Y (Alt+Shift+Y) today.
 *
 * Use your own buttons instead when the toolbar picks a month or a date as well; give the grid
 * `onDateChange` for its keys either way.
 *
 * @group Data
 * @see https://ui.ouro.bot/docs/time-grid
 *
 * @example
 * <TimeGridNav date={date} view={view} onDateChange={setDate} />
 * <TimeGrid label="Team calendar" date={date} view={view} onDateChange={setDate} events={events} />
 * @claim "three buttons that move its `date`" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGridNav > moves the date by the view's day or week and to today, with each key in its button's tooltip)
 * @claim "The grid takes the same keys" registry/ouro/components/ouro/time-grid/time-grid.test.tsx verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid > moves to the next or previous period with Page Down and Page Up, or Alt with the arrows, and to today with Alt+Shift+Y)
 */
export function TimeGridNav(props: TimeGridNavProps): JSX.Element {
  const { date, view = "week", onDateChange, timeZone, labels, className } = props;
  useAppearanceClassNameCheck(
    "TimeGridNav",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; TimeGridNav draws Ouro's own buttons`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  const unit = view === "day" ? "day" : "week";
  const step = view === "day" ? 1 : 7;
  const today = labels?.today ?? "Today";
  const previous = labels?.previous ?? `Previous ${unit}`;
  const next = labels?.next ?? `Next ${unit}`;
  const tip = (words: string, keys: string[]) => (
    <span className="inline-flex items-center gap-2">
      {words}
      <Kbd keys={keys} />
    </span>
  );
  return (
    <div data-ouro="time-grid-nav" className={cn("inline-flex items-center gap-1", className)}>
      <Tooltip content={tip(today, ["alt", "shift", "y"])}>
        <Button variant="outline" size="sm" onClick={() => onDateChange(todayOn(zonedClock(timeZone)))}>
          {today}
        </Button>
      </Tooltip>
      <Tooltip content={tip(previous, ["alt", "up"])}>
        <Button variant="plain" tone="secondary" size="sm" aria-label={previous} onClick={() => onDateChange(addDays(date, -step))}>
          {chevron("M10 3.5L5.5 8l4.5 4.5")}
        </Button>
      </Tooltip>
      <Tooltip content={tip(next, ["alt", "down"])}>
        <Button variant="plain" tone="secondary" size="sm" aria-label={next} onClick={() => onDateChange(addDays(date, step))}>
          {chevron("M6 3.5L10.5 8 6 12.5")}
        </Button>
      </Tooltip>
    </div>
  );
}
