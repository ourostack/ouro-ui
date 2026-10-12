import { type AgentCase, notAssignable, hint } from "./shared.ts";

/** The accordion snippets in accordion.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "accordion01",
    habit: "Radix's type=\"multiple\"",
    tsc: [hint("string", "Use <Accordion multiple> for several open items; one at a time is the default")],
    dev: "<Accordion multiple>",
    names: ["tsc", "dev"],
  },
  { id: "accordion02", habit: "Radix's collapsible", tsc: [hint("boolean", "Remove it: an open item always closes when pressed")], dev: "<Accordion>", names: ["tsc", "dev"] },
  {
    id: "accordion03",
    habit: "a heading level past h6",
    tsc: [notAssignable("7", `2 | 3 | 4 | 5 | 6 | (number & { 'Use 2, 3, 4, 5 or 6': never; }) | undefined`)],
    dev: "<Accordion headingLevel={3}>",
    names: ["tsc", "dev"],
  },
];

/** Valid accordion snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["accordionOk01"];
