export const dateFormats: Record<DateFormat, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: "medium" },
  month: { month: "short", year: "numeric" },
  datetime: { dateStyle: "medium", timeStyle: "short" },
  time: { timeStyle: "short" },
};

/** How much of the date and time {@link LocalDate} shows. */
export type DateFormat = "date" | "month" | "datetime" | "time";

/** The instant as a Date, or null when it is not one. */
export function toDate(value: Date | string | number): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Nothing to subscribe to: the value only changes between the server and the browser. */
export const subscribeNever = (): (() => void) => () => {};
export const inBrowser = (): boolean => true;
export const onServer = (): boolean => false;
