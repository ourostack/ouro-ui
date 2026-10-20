import { type AgentCase, hint } from "./shared.ts";

/** The skip-link snippets in skip-link.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "skipLink01", habit: "an href with a hash", tsc: [hint("string", 'Use <SkipLink target="main" /> (the id, without #)')], dev: '<SkipLink target="main" />', names: ["tsc", "dev"] },
  { id: "skipLink02", habit: "a label prop for the text", tsc: [hint("string", "Use <SkipLink>Skip to recipes</SkipLink>")], dev: "<SkipLink>Skip to content</SkipLink>", names: ["tsc", "dev"] },
];

/** Valid skip-link snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["skipLinkOk01"];
