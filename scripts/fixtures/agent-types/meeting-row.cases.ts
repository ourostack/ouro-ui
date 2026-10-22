import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The meeting-row snippets in meeting-row.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "meetingRow01", habit: "a calendar API's subject", tsc: [hint("string", 'Use title="Weekly sync"')], dev: '<MeetingRow title="Weekly sync">', names: ["tsc", "dev"] },
  {
    id: "meetingRow02",
    habit: "a live state",
    tsc: [notAssignable('"live"', `MeetingState | (string & { 'Use "past", "now" or "upcoming"': never; })`)],
    dev: '<MeetingRow state="upcoming">',
    names: ["tsc", "dev"],
  },
];

/** Valid meeting-row snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["meetingRowOk01"];
