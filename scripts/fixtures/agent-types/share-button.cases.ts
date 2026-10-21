import { type AgentCase, hint } from "./shared.ts";

/** The share-button snippets in share-button.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "shareButton01", habit: "href for the link to share", tsc: [hint("string", "Use url={link}")], dev: '<ShareButton url="https://example.com/notes/42" />', names: ["tsc", "dev"] },
  { id: "shareButton02", habit: "onClick to react to the share", tsc: [hint("() => void", "Use onShare={(result) => ...}")], dev: "<ShareButton onShare={(result) => {}} />", names: ["tsc", "dev"] },
];

/** Valid share-button snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["shareButtonOk01"];
