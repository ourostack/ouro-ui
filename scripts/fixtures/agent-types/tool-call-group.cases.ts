import { type AgentCase, hint } from "./shared.ts";

/** The tool-call-group snippets in tool-call-group.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "toolCallGroup01", habit: "a title prop for the group's line", tsc: [hint("string", 'Use <ToolCallGroup summary="Read the recipe">')], dev: '<ToolCallGroup summary="Read the recipe">', names: ["tsc", "dev"] },
];

/** Valid tool-call-group snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["toolCallGroupOk01"];
