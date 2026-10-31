import { type AgentCase, hint } from "./shared.ts";

/** The thread-summary snippets in thread-summary.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "threadSummary01", habit: "onClick to open the thread", tsc: [hint("() => void", "Use onOpen={openThread}")], dev: "<ThreadSummary count={2} onOpen={openThread}>", names: ["tsc", "dev"] },
  { id: "threadSummary02", habit: "a replyCount prop", tsc: [hint("number", "Use count={replies.length}")], dev: "<ThreadSummary count={replies.length}>", names: ["tsc", "dev"] },
];

/** Valid thread-summary snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["threadSummaryOk01"];
