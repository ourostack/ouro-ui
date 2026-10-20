import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The page-header snippets in page-header.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "pageHeader01", habit: "a subtitle prop", tsc: [hint("string", 'Use <PageHeader description="..." />')], dev: '<PageHeader description="Your plan and invoices." />', names: ["tsc", "dev"] },
  {
    id: "pageHeader02",
    habit: "a deeper heading level",
    tsc: [notAssignable("3", `1 | 2 | (number & { 'Use 1 for the page title or 2 for a section': never; }) | undefined`)],
    dev: "<PageHeader level={2} />",
    names: ["tsc", "dev"],
  },
];

/** Valid page-header snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["pageHeaderOk01"];
