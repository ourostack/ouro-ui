import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The hero snippets in hero.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "hero01", habit: "a subtitle prop", tsc: [hint("string", 'Use <Hero description="..." />')], dev: '<Hero description="..." />', names: ["tsc", "dev"] },
  {
    id: "hero02",
    habit: "a deeper heading level",
    tsc: [notAssignable("3", `1 | 2 | (number & { 'Use 1 for the page headline or 2 for a section': never; }) | undefined`)],
    dev: "<Hero headingLevel={2} />",
    names: ["tsc", "dev"],
  },
];

/** Valid hero snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["heroOk01"];
