import { type AgentCase, hint } from "./shared.ts";

/** The celebrate snippets in celebrate.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "celebrate01", habit: "open, as on overlays", tsc: [hint("boolean", "Use show={done}")], dev: "<Celebrate show={done} />", names: ["tsc", "dev"] },
];

/** Valid celebrate snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["celebrateOk01"];
