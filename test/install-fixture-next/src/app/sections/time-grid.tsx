import { TimeGrid } from "@/components/ouro/time-grid/time-grid";

// expect: data-ouro="time-grid"
// expect: aria-label="Team calendar"
// expect: aria-label="Thursday, March 12"
// expect: Design review
export default function TimeGridSection() {
  return (
    <TimeGrid
      label="Team calendar"
      date="2026-03-12"
      view="work-week"
      timeZone="Europe/London"
      events={[{ id: "review", title: "Design review", start: "2026-03-12T09:00:00Z", end: "2026-03-12T10:00:00Z" }]}
    />
  );
}
