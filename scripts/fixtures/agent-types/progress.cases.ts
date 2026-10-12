import { type AgentCase, hint } from "./shared.ts";

/** The progress snippets in progress.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "progress01", habit: "an indeterminate flag", tsc: [hint("boolean", "Use <Progress value={null}>")], dev: "<Progress value={null}>", names: ["tsc", "dev"] },
  {
    id: "progress02",
    habit: "a progress bar with no label",
    tsc: [`error TS2741: Property 'label' is missing in type '{ value: number; }' but required in type 'ProgressProps'.`],
    names: ["tsc"],
  },
];

/** Valid progress snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["progressValid"];
