import { type AgentCase, hint } from "./shared.ts";

/** The text-area snippets in text-area.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "s48", habit: "MUI's minRows", tsc: [hint("number", "Use <TextArea autoGrow rows={2} maxRows={8}>")], dev: "<TextArea autoGrow rows={2} maxRows={8}>", names: ["tsc", "dev"] },
  { id: "s49", habit: "an autoResize prop", tsc: [hint("boolean", "Use <TextArea autoGrow>")], dev: "<TextArea autoGrow>", names: ["tsc", "dev"] },
];

/** Valid text-area snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ok12"];
