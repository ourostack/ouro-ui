import { type AgentCase, hint } from "./shared.ts";

/** The briefing-card snippets in briefing-card.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "briefingCard01", habit: "sections for the rows", tsc: [hint("string", "Use items={rows}")], dev: "<BriefingCard items={rows}>", names: ["tsc", "dev"] },
];

/** Valid briefing-card snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["briefingCardOk01"];
