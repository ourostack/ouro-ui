import { type AgentCase, hint } from "./shared.ts";

/** The thinking-block snippets in thinking-block.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "thinkingBlock01", habit: "isStreaming, as in AI Elements' Reasoning", tsc: [hint("boolean", "Use <ThinkingBlock streaming>")], dev: "<ThinkingBlock streaming>", names: ["tsc", "dev"] },
  { id: "thinkingBlock02", habit: "a title prop for the finished title", tsc: [hint("string", 'Use <ThinkingBlock summary="Checked the ratios">')], dev: '<ThinkingBlock summary="Checked the ratios">', names: ["tsc", "dev"] },
  { id: "thinkingBlock03", habit: "a content prop for the reasoning", tsc: [hint("string", "Pass the reasoning as children: <ThinkingBlock>{reasoning}</ThinkingBlock>")], dev: "<ThinkingBlock>{reasoning}</ThinkingBlock>", names: ["tsc", "dev"] },
];

/** Valid thinking-block snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["thinkingBlockOk01"];
