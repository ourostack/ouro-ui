import { useState, type JSX } from "react";
import { Calendar, type DateRange } from "@/registry/ouro/components/ouro/calendar/calendar";

// The live demo at the top of docs/calendar/: the component as an app would use it, with its props, nothing else.

export default function CalendarDemo(): JSX.Element {
  const [trip, setTrip] = useState<DateRange | null>(null);
  return <Calendar label="Trip" range value={trip} onValueChange={setTrip} />;
}
