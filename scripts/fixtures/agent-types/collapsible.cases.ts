import { type AgentCase, hint } from "./shared.ts";

/** The collapsible snippets in collapsible.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "collapsible01",
    habit: "a trigger element, as on Dialog",
    tsc: [
      `error TS2741: Property ''Use <Collapsible title="Nutrition facts">'' is missing in type 'ReactElement<any, any>' but required in type '{ 'Use <Collapsible title="Nutrition facts">': never; }'.`,
    ],
    dev: '<Collapsible title="Nutrition facts">',
    names: ["tsc", "dev"],
  },
  { id: "collapsible02", habit: "an isOpen flag", tsc: [hint("boolean", "Use <Collapsible open>")], dev: "<Collapsible open>", names: ["tsc", "dev"] },
];

/** Valid collapsible snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["collapsibleOk01"];
