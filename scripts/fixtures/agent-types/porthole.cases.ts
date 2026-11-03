import { type AgentCase, hint } from "./shared.ts";

/** The porthole snippets in porthole.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "porthole01",
    habit: "an items prop for what to show",
    tsc: ["error TS2741: Property ''Pass items in source.getSnapshot()'' is missing in type 'never[]' but required in type '{ 'Pass items in source.getSnapshot()': never; }'."],
    dev: "<Porthole source={{ snapshot: { version: 1, items, areas }, lastBeatAt }} />",
    names: ["tsc", "dev"],
  },
  { id: "porthole02", habit: "a status prop", tsc: [hint("string", "Porthole decides the status from source")], dev: "<Porthole source={statusSource} />", names: ["tsc", "dev"] },
];

/** Valid porthole snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["portholeOk01"];
