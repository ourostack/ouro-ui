import { type AgentCase, hint } from "./shared.ts";

export const agentCases: AgentCase[] = [
  { id: "ringCard01", habit: "phone as the call kind", tsc: [hint('"phone"', 'Use "audio" or "video"')], dev: '<RingCard kind="audio" />', names: ["tsc", "dev"] },
];
export const validSnippets: string[] = ["ringCardOk01"];
