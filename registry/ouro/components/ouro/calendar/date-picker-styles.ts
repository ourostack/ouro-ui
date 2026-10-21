export { formatDateInput, parseDateInput };

// Typing a date into DatePicker's text box: the locale's numeric date (10/11/2026 in en-US,
// 11/10/2026 in en-GB, 11.10.2026 in de) both ways, apart from the component so its file
// exports only components (React Fast Refresh).

/** The locale's numeric date format, in Latin digits so it can be typed back. */
function numeric(locale: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", numberingSystem: "latn", timeZone: "UTC" });
}

/**
 * The year ending in two typed digits that lies from 50 years before this year to 49 after it.
 *
 * @claim "The year ending in two typed" registry/ouro/components/ouro/calendar/date-picker.test.tsx verify:testExists(registry/ouro/components/ouro/calendar/date-picker.test.tsx::DatePicker > typing > reads a two-digit year as the year within 50 years of today)
 */
function fullYear(twoDigits: number): number {
  const earliest = new Date().getFullYear() - 50;
  const year = Math.floor(earliest / 100) * 100 + twoDigits;
  return year < earliest ? year + 100 : year;
}

/**
 * An ISO date as the locale writes it in numbers (`"2026-10-11"` is `"10/11/2026"` in
 * en-US), or `""` for no date.
 *
 * @internal
 * @claim "An ISO date as the locale" registry/ouro/components/ouro/calendar/date-picker.test.tsx verify:testExists(registry/ouro/components/ouro/calendar/date-picker.test.tsx::DatePicker > typing > reads the locale's numbers or ISO, and writes the date the locale's way on blur)
 * @claim "An ISO date as the locale" registry/ouro/components/ouro/calendar/date-picker.test.tsx verify:testExists(registry/ouro/components/ouro/calendar/date-picker.test.tsx::DatePicker > value > reformats when the locale changes, and ignores values that are not ISO dates)
 */
function formatDateInput(iso: string, locale: string): string {
  return iso === "" ? "" : numeric(locale).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * What the user typed as an ISO date, or `null` when it is not a real date. It reads the
 * locale's order of day, month and year with any separators, a two-digit year as the year
 * ending in those digits within 50 years of today (in 2026, 85 is 1985 and 30 is 2030), and
 * an ISO date as it is.
 *
 * @internal
 * @claim "It reads the locale's order of" registry/ouro/components/ouro/calendar/date-picker.test.tsx verify:testExists(registry/ouro/components/ouro/calendar/date-picker.test.tsx::DatePicker > typing > reads a two-digit year as the year within 50 years of today)
 * @claim "It reads the locale's order of" registry/ouro/components/ouro/calendar/date-picker.test.tsx verify:testExists(registry/ouro/components/ouro/calendar/date-picker.test.tsx::DatePicker > typing > reads the locale's numbers or ISO, and writes the date the locale's way on blur)
 */
function parseDateInput(text: string, locale: string): string | null {
  const iso = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(text);
  const numbers = iso ? iso.slice(1) : text.match(/\d+/g);
  if (!numbers || numbers.length !== 3) return null;
  const order = iso
    ? ["year", "month", "day"]
    : numeric(locale)
        .formatToParts(new Date(0))
        .map((part) => part.type)
        .filter((type) => type === "year" || type === "month" || type === "day");
  const parts: Record<string, number> = {};
  order.forEach((type, index) => (parts[type] = Number(numbers[index])));
  const year = numbers[order.indexOf("year")]!.length <= 2 ? fullYear(parts.year!) : parts.year!;
  const { month, day } = parts as { month: number; day: number };
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
