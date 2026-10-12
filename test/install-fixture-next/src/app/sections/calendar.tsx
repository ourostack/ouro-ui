import { Calendar } from "@/components/ouro/calendar/calendar";

// expect: Ouro calendar
// expect: October 2026
// expect: Sunday, October 11, 2026
// expect: role="grid"
export default function CalendarSection() {
  return <Calendar label="Ouro calendar" defaultValue="2026-10-11" />;
}
