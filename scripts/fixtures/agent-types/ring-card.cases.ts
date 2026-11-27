import { type AgentCase, notAssignable } from "./shared.ts";

export const agentCases: AgentCase[] = [
  { id: "ringCard01", habit: "phone as the call kind", tsc: [notAssignable('"phone"', `"audio" | "video" | (string & { 'Use "audio" or "video"': never; })`)], dev: '<RingCard kind="audio" />', names: ["tsc", "dev"] },
];
export const validSnippets: string[] = ["ringCardOk01"];
