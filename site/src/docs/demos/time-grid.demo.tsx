import { useState, type JSX } from "react";
import { TimeGrid, type TimeGridEvent } from "@/registry/ouro/components/ouro/time-grid/time-grid";

// The live demo at the top of docs/time-grid/: the component as an app would use it, with its props, nothing else.

/** A made-up team's week, in the week the reader opens the page, so the now line shows. */
function week(): { date: string; events: TimeGridEvent[] } {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const day = (offset: number, hour: number, minute = 0) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset, hour, minute);
  const iso = (offset: number) => {
    const date = day(offset, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  return {
    date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    events: [
      { id: "offsite", title: "Team offsite", start: iso(1), end: iso(2), tone: "success", description: "Harbour Hall" },
      ...[0, 1, 2, 3, 4].map((offset) => ({ id: `standup-${offset}`, title: "Standup", start: day(offset, 9, 30), end: day(offset, 9, 45) })),
      { id: "planning", title: "Sprint planning", start: day(0, 10), end: day(0, 11, 30), description: "Room 4" },
      { id: "lunch", title: "Lunch with Maya", start: day(0, 12), end: day(0, 13), status: "free", tone: "secondary" },
      { id: "interview", title: "Interview: front-end engineer", start: day(1, 14), end: day(1, 15), tone: "warning" },
      { id: "design", title: "Design review", start: day(2, 11), end: day(2, 12), description: "Room 2" },
      { id: "pairing", title: "Pairing with Jo", start: day(2, 11, 30), end: day(2, 13), status: "tentative" },
      { id: "forum", title: "Architecture forum", start: day(3, 10), end: day(3, 11), status: "unanswered", description: "Main auditorium" },
      { id: "focus", title: "Focus time", start: day(3, 10, 30), end: day(3, 12), tone: "secondary" },
      { id: "retro", title: "Retro", start: day(3, 15), end: day(3, 16), status: "cancelled" },
      { id: "demo", title: "Demo day", start: day(4, 13), end: day(4, 15), tone: "success" },
    ],
  };
}

export default function TimeGridDemo(): JSX.Element {
  const [{ date, events }] = useState(week);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="w-full">
      <TimeGrid label="Team calendar" date={date} view="work-week" events={events} selectedId={selected} onEventSelect={(event) => setSelected(event.id)} className="h-[32rem]" />
    </div>
  );
}
