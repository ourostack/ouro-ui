import { type AgentCase, hint } from "./shared.ts";

/** The relative-time snippets in relative-time.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "relativeTime01", habit: "the current time passed in", tsc: [hint("number", "RelativeTime keeps itself current; remove now")], dev: "<RelativeTime value={date} />", names: ["tsc", "dev"] },
];

/** Valid relative-time snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["relativeTimeOk01"];
