import { type AgentCase } from "./shared.ts";

/** The theme-picker snippets in theme-picker.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [];

/** Valid theme-picker snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["themePickerOk01"];
