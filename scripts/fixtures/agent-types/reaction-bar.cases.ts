import { type AgentCase, hint } from "./shared.ts";

/** The reaction-bar snippets in reaction-bar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "reactionBar01", habit: "an onReactionClick callback", tsc: [hint("() => void", "Use onReact={(key) => react(key)}")], dev: "<ReactionBar onReact={(key) => react(key)}>", names: ["tsc", "dev"] },
];

/** Valid reaction-bar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["reactionBarOk01"];
