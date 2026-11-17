import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The section-header snippets in section-header.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "sectionHeader01", habit: "a count prop", tsc: [hint("string", 'Use meta="12 recipes"')], dev: '<SectionHeader meta="12 recipes" />', names: ["tsc", "dev"] },
  {
    id: "sectionHeader02",
    habit: "the page's heading level",
    tsc: [notAssignable("1", `2 | 3 | (number & { 'Use 2 for a section or 3 for one inside it': never; }) | undefined`)],
    dev: "<SectionHeader level={3} />",
    names: ["tsc", "dev"],
  },
];

/** Valid section-header snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["sectionHeaderOk01"];
