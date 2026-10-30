// What agents write with time-grid: snippets whose cases are in time-grid.cases.ts.
import { TimeGrid, type TimeGridEvent } from "@/registry/ouro/components/ouro/time-grid/time-grid";

const meetings: TimeGridEvent[] = [{ id: "1", title: "Design review", start: "2026-03-12T09:00:00Z", end: "2026-03-12T10:00:00Z" }];

export const timeGrid01 = <TimeGrid label="Team calendar" date="2026-03-12" events={meetings} onSelectEvent={() => {}} />;
export const timeGrid02 = <TimeGrid date="2026-03-12" events={meetings} />;
export const timeGrid03 = <TimeGrid label="Team calendar" date="2026-03-12" events={meetings} view="month" />;
export const timeGrid04 = <TimeGrid label="Team calendar" date="2026-03-12" events={[{ id: "2", title: "Offsite", start: "2026-03-12", allDay: true }]} />;
export const timeGridOk01 = <TimeGrid label="Team calendar" date="2026-03-12" view="work-week" events={[...meetings, { id: "2", title: "Offsite", start: "2026-03-12", end: "2026-03-13", tone: "success", status: "tentative", description: "Harbour Hall", href: "/events/2" }]} timeZone="Europe/Berlin" locale="de-DE" now={new Date("2026-03-12T10:41:00Z")} workingHours={{ start: 8.5, end: 17 }} selectedId="1" onEventSelect={(event) => void event.id} onSlotSelect={({ start, end }) => void [start, end]} slotMinutes={15} allDayLabel="Ganztägig" statusLabels={{ unanswered: "Antwort fehlt" }} nowAdornment={<span>•</span>} className="h-[40rem]" />;
