"use client";

import { useSyncExternalStore, type JSX, type Ref, type TimeHTMLAttributes } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { dateFormats, dateText, inBrowser, onServer, subscribeNever, toDate, type DateFormat } from "@/registry/ouro/components/ouro/local-date/local-date-styles";

export type { DateFormat } from "@/registry/ouro/components/ouro/local-date/local-date-styles";

/** The props LocalDate adds to the `<time>` attributes it passes through. */
export interface LocalDateOwnProps {
  /**
   * The instant: a `Date`, an ISO string or a timestamp in milliseconds. A calendar date with no
   * time ("2026-06-01", or "2026-06" with `format="month"`) is that day for every reader and is
   * never moved into a time zone.
   */
  value: Date | string | number;
  /** `date` "Jun 1, 2026", `month` "Jun 2026", `datetime` "Jun 1, 2026, 9:30 AM", `time` "9:30 AM". @default "date" */
  format?: DateFormat | (string & { 'Use "date", "month", "datetime" or "time"': never }) | undefined;
  /** The language and region to write it in. @default the reader's */
  locale?: Intl.LocalesArgument | undefined;
  /** Layout only. Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLTimeElement> | undefined;

  /** Not a prop. The instant is `value`: `<LocalDate value={note.createdAt} />`. */
  date?: { 'Use value={date}': never };
  /** Not a prop. The instant is `value`; the `<time>` gets its `dateTime` from it. */
  dateTime?: { 'Use value={date}; dateTime is set from it': never };
  /** Not a prop. The text is the date; there are no children. */
  children?: { 'LocalDate writes the date itself; pass value={date}': never };
}

/** Props for {@link LocalDate}: its own props and the `<time>` attributes it passes through. */
export type LocalDateProps = Omit<TimeHTMLAttributes<HTMLTimeElement>, keyof LocalDateOwnProps> & LocalDateOwnProps;

/**
 * A date (and time) in the reader's own time zone and language, in a `<time>` that carries
 * the exact instant. Only the browser knows the reader's time zone, so the server writes the
 * instant in UTC, hydration repeats it so the markup matches, and the browser then shows the
 * local one. A date then changes only when the instant falls near midnight, but a time
 * (`time`, `datetime`) changes for every reader outside UTC, so the server's text names the
 * zone ("9:30 AM UTC") until the browser takes over. A calendar date with no time ("2026-06-01")
 * is the same day for everyone and is written the same on the server and in the browser.
 *
 * Use `RelativeTime` instead for "3 days ago", and `Intl.DateTimeFormat` in your own text for
 * a date inside a sentence you build.
 *
 * @group Text
 * @see https://ourostack.github.io/ouro-ui/docs/local-date
 *
 * @example
 * <LocalDate value={note.updatedAt} format="datetime" />
 */
export function LocalDate(props: LocalDateProps): JSX.Element {
  const {
    value,
    format: formatProp = "date",
    locale,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    date: dateProp,
    dateTime,
    children,
    ...rest
  } = props;
  const format: DateFormat = Object.hasOwn(dateFormats, formatProp) ? (formatProp as DateFormat) : "date";
  const date = toDate(value);
  useAppearanceClassNameCheck(
    "LocalDate",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; style the text around it instead`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "LocalDate",
    process.env.NODE_ENV !== "production"
      ? () => [
          format !== formatProp && [`format="${String(formatProp)}" is not a format; use "date", "month", "datetime" or "time"`, '<LocalDate format="datetime" />'],
          date === null && [`value={${JSON.stringify(value)}} is not a date`, "<LocalDate value={new Date()} />"],
          dateProp !== undefined && ["date is not a prop", "<LocalDate value={date} />"],
          dateTime !== undefined && ["dateTime is not a prop; it is set from value", "<LocalDate value={date} />"],
          children !== undefined && ["LocalDate writes the date itself", "<LocalDate value={date} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const hydrated = useSyncExternalStore(subscribeNever, inBrowser, onServer);
  const written = dateText(value, format, locale, hydrated ? undefined : "UTC", !hydrated);
  return (
    <time {...rest} data-ouro="local-date" dateTime={written?.dateTime} className={cn(className)}>
      {written?.text}
    </time>
  );
}
