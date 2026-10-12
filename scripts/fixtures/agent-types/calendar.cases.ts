import { type AgentCase, hint } from "./shared.ts";

/** The calendar snippets in calendar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "calendar01", habit: "react-day-picker's selected", tsc: [hint("string", "Use value={date} onValueChange={setDate}")], dev: "<Calendar value={date} onValueChange={setDate}>", names: ["tsc", "dev"] },
  { id: "calendar02", habit: "react-day-picker's mode", tsc: [hint("string", "Use <Calendar range> for a range; one day is the default")], dev: "<Calendar range>", names: ["tsc", "dev"] },
  { id: "calendar03", habit: "date-fns' weekStartsOn", tsc: [hint("number", 'The locale sets it: locale="en-GB" or "en-US-u-fw-mon"')], dev: '<Calendar locale="en-GB">, or locale="en-US-u-fw-mon"', names: ["tsc", "dev"] },
  { id: "calendar04", habit: "react-datepicker's minDate", tsc: [hint("string", 'Use min="2026-10-11"')], dev: '<Calendar min="2026-10-11">', names: ["tsc", "dev"] },
];

/** Valid calendar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["calendarOk01", "calendarOk02"];
