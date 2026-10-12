// What agents write with calendar: snippets whose cases are in calendar.cases.ts.
import { Calendar } from "@/registry/ouro/components/ouro/calendar/calendar";

const setDate = (date: string): void => void date;

export const calendar01 = <Calendar label="Date" selected="2026-10-11" />;
export const calendar02 = <Calendar label="Date" mode="range" />;
export const calendar03 = <Calendar label="Date" weekStartsOn={1} />;
export const calendar04 = <Calendar label="Date" minDate="2026-10-11" />;
export const calendarOk01 = <Calendar label="Date" value="2026-10-11" onValueChange={setDate} min="2026-10-01" max="2026-12-31" locale="en-GB" />;
export const calendarOk02 = <Calendar label="Trip" range value={null} onValueChange={(trip) => void trip.start} />;
