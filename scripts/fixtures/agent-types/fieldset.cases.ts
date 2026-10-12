import { type AgentCase, hint } from "./shared.ts";

/** The fieldset snippets in fieldset.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "s39", habit: "a label on a group", tsc: [hint("string", 'Use <Fieldset legend="Shipping address">')], dev: '<Fieldset legend="Shipping address">', names: ["tsc", "dev"] },
];

/** Valid fieldset snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ok09"];
