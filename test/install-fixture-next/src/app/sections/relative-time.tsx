import { RelativeTime } from "@/components/ouro/relative-time/relative-time";

// The server writes the UTC date; the browser says how long ago after hydration. A calendar
// date is that day on the server.
// expect: data-ouro="relative-time"
// expect: 2026-06-01T09:30:00.000Z
// expect: Jun 1, 2026
// expect: "2026-06-03"
// expect: >Jun 3, 2026</time>
export default function RelativeTimeSection() {
  return (
    <p>
      <RelativeTime value="2026-06-01T09:30:00Z" locale="en-US" /> <RelativeTime value="2026-06-03" locale="en-US" />
    </p>
  );
}
