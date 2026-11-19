import { type AgentCase, hint } from "./shared.ts";

/** The agent-handoff snippets in agent-handoff.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "agentHandoff01", habit: "a text prop for the line", tsc: [hint("string", 'Use prompt="the line to paste"')], dev: '<AgentHandoff prompt="Read https://example.com/llms.txt" />', names: ["tsc", "dev"] },
  { id: "agentHandoff02", habit: "a command prop, as for a terminal", tsc: [hint("string", 'Use prompt="the line to paste"; a terminal command is CodeBlock')], dev: '<AgentHandoff prompt="npx shadcn add" />', names: ["tsc", "dev"] },
  { id: "agentHandoff03", habit: "a title prop for the label", tsc: [hint("string", 'Use label="Hand it to your agent"')], dev: '<AgentHandoff label="Hand it to your agent" />', names: ["tsc", "dev"] },
  { id: "agentHandoff04", habit: "a description prop for the caption", tsc: [hint("string", 'Use caption="Paste it into your coding agent chat."')], dev: '<AgentHandoff caption="Paste it." />', names: ["tsc", "dev"] },
];

/** Valid agent-handoff snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["agentHandoffOk01"];
