import { type AgentCase, hint } from "./shared.ts";

/** The agent-note snippets in agent-note.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "agentNote01", habit: "a by prop for the author", tsc: [hint("string", 'Use author="agent" name="Ouro"')], dev: '<AgentNote author="agent" name="Ouro">', names: ["tsc", "dev"] },
  { id: "agentNote02", habit: "a basis prop for what it was based on", tsc: [hint("string", 'Use source="Based on 3 messages"')], dev: '<AgentNote source="Based on 3 messages">', names: ["tsc", "dev"] },
];

/** Valid agent-note snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["agentNoteOk01"];
