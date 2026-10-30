import { type AgentCase } from "./shared.ts";

/** The time-grid snippets in time-grid.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "timeGrid01",
    habit: "a calendar library's onSelectEvent",
    tsc: [`error TS2322: Type '() => void' is not assignable to type '{ "Use onEventSelect={(event) => open(event.id)}": never; }'.`],
    dev: "<TimeGrid onEventSelect={(event) => open(event.id)}>",
    names: ["tsc", "dev"],
  },
  {
    id: "timeGrid02",
    habit: "a grid with no name",
    tsc: ["error TS2741: Property 'label' is missing in type '{ date: string; events: TimeGridEvent[]; }' but required in type 'TimeGridOwnProps'."],
    dev: '<TimeGrid label="Team calendar">',
    names: ["tsc", "dev"],
  },
  {
    id: "timeGrid03",
    habit: "a month view",
    tsc: [`error TS2322: Type '"month"' is not assignable to type 'TimeGridView | (string & { 'Use "day", "work-week" or "week"': never; }) | undefined'.`],
    dev: '<TimeGrid view="week">',
    names: ["tsc", "dev"],
  },
  {
    id: "timeGrid04",
    habit: "an allDay flag on an event",
    tsc: [`error TS2322: Type 'boolean' is not assignable to type '{ 'Pass start as a date: start: "2026-03-12"': never; }'.`],
    dev: '{ start: "2026-03-12" }',
    names: ["tsc", "dev"],
  },
];

/** Valid time-grid snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["timeGridOk01"];
