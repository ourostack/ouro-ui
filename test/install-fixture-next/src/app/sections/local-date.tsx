import { LocalDate } from "@/components/ouro/local-date/local-date";

// The server writes the UTC date, and names the zone after a time; the browser shows the
// reader's own after hydration. A calendar date is the same day on the server and everywhere.
// expect: data-ouro="local-date"
// expect: 2026-06-01T09:30:00.000Z
// expect: Jun 1, 2026
// expect: AM UTC</time>
// expect: "2026-06-02"
// expect: >Jun 2, 2026</time>
export default function LocalDateSection() {
  return (
    <p>
      <LocalDate value="2026-06-01T09:30:00Z" locale="en-US" /> <LocalDate value="2026-06-01T09:30:00Z" format="time" locale="en-US" />{" "}
      <LocalDate value="2026-06-02" locale="en-US" />
    </p>
  );
}
