import { MeetingRow } from "@/components/ouro/meeting-row/meeting-row";

// expect: data-ouro="meeting-row"
// expect: Ouro weekly sync
// expect: <time[^>]*dateTime="2026-06-01T10:00"
export default function MeetingRowSection() {
  return <MeetingRow title="Ouro weekly sync" time="10:00" dateTime="2026-06-01T10:00" state="now" status="Organizer" />;
}
