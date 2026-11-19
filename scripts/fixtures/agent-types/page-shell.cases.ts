import { type AgentCase } from "./shared.ts";

/** The page-shell snippets in page-shell.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [];

/** Valid page-shell snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["pageShellOk01"];
