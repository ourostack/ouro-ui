import { type AgentCase, notAssignable } from "./shared.ts";

const spinnerSizes = `"sm" | "md" | "lg" | (string & { 'Use "sm", "md" or "lg"': never; }) | undefined`;

/** The spinner snippets in spinner.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "spinner01", habit: "an xl spinner", tsc: [notAssignable('"xl"', spinnerSizes)], dev: '<Spinner size="md">', names: ["tsc", "dev"] },
];

/** Valid spinner snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["spinnerValid"];
