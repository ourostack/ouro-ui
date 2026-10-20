import { RelativeTime } from "@/components/ouro/relative-time/relative-time";

// The server writes the UTC date; the browser says how long ago after hydration.
// expect: data-ouro="relative-time"
// expect: 2026-06-01T09:30:00.000Z
// expect: Jun 1, 2026
export default function RelativeTimeSection() {
  return <RelativeTime value="2026-06-01T09:30:00Z" locale="en-US" />;
}
