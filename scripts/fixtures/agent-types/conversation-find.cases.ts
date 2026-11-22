import { type AgentCase, hint } from "./shared.ts";

/** The conversation-find snippets in conversation-find.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "conversationFind01", habit: "value for what is typed", tsc: [hint("string", "Use <ConversationFind query={query} onQueryChange={setQuery}>")], names: ["tsc"] },
  { id: "conversationFind02", habit: "onNext for stepping", tsc: [hint("() => void", "Use <ConversationFind onCurrentChange={setCurrent}>")], names: ["tsc"] },
];

/** Valid conversation-find snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["conversationFindOk01"];
