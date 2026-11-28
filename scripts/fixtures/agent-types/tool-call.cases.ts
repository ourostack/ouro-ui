import { type AgentCase, hint } from "./shared.ts";

/** The tool-call snippets in tool-call.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "toolCall01", habit: "AI Elements' state for the status", tsc: [hint("string", 'Use <ToolCall status="running">')], dev: '<ToolCall status="running">', names: ["tsc", "dev"] },
  { id: "toolCall02", habit: "an args object for the arguments", tsc: [hint("string", 'Use <ToolCall detail="recipes/roast.md">')], dev: '<ToolCall detail="recipes/roast.md">', names: ["tsc", "dev"] },
  { id: "toolCall03", habit: "a result prop for the output", tsc: [hint("string", "Use <ToolCall output={text}>")], dev: "<ToolCall output={text}>", names: ["tsc", "dev"] },
];

/** Valid tool-call snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["toolCallOk01"];
