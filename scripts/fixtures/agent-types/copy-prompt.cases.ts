import { type AgentCase, hint } from "./shared.ts";

/** The copy-prompt snippets in copy-prompt.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "copyPrompt01", habit: "a prompt prop for the text", tsc: [hint("string", 'Use text="Suggest a layout for my mornings."')], dev: '<CopyPrompt text="Suggest a layout for my mornings.">', names: ["tsc", "dev"] },
];

/** Valid copy-prompt snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["copyPromptOk01"];
