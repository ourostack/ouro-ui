import { LocalDate } from "@/components/ouro/local-date/local-date";

// The server writes the UTC date; the browser shows the reader's own after hydration.
// expect: data-ouro="local-date"
// expect: 2026-06-01T09:30:00.000Z
// expect: Jun 1, 2026
export default function LocalDateSection() {
  return <LocalDate value="2026-06-01T09:30:00Z" locale="en-US" />;
}
