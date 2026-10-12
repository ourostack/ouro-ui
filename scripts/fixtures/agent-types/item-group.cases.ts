import { type AgentCase, hint } from "./shared.ts";

/** The item-group snippets in item-group.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "itemGroup01", habit: "a title on ItemGroup", tsc: [hint("string", 'Use <ItemGroup label="Bearer credentials">')], dev: '<ItemGroup label="Tokens">', names: ["tsc", "dev"] },
  { id: "itemGroup02", habit: "a divided flag", tsc: [hint("boolean", 'Use <ItemGroup variant="divided">')], dev: '<ItemGroup variant="divided">', names: ["tsc", "dev"] },
];

/** Valid item-group snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["itemGroup03"];
