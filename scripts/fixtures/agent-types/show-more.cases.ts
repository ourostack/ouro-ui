import { type AgentCase, hint } from "./shared.ts";

/** The show-more snippets in show-more.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "showMore01", habit: "a maxLines prop", tsc: [hint("number", "Use <ShowMore lines={3}>")], dev: "<ShowMore lines={3}>", names: ["tsc", "dev"] },
  { id: "showMore02", habit: "a limit prop", tsc: [hint("number", "Use <ShowMore items={items} initialCount={5}>")], dev: "<ShowMore items={items} initialCount={3}>", names: ["tsc", "dev"] },
];

/** Valid show-more snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["showMoreOk01", "showMoreOk02", "showMoreOk03"];
