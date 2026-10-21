import { type AgentCase, hint } from "./shared.ts";

/** The sync-status snippets in sync-status.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "syncStatus01", habit: "state for the status", tsc: [hint("string", 'Use status="saving"')], dev: '<SyncStatus status="saving" />', names: ["tsc", "dev"] },
  { id: "syncStatus02", habit: "an online flag", tsc: [hint("boolean", 'Use status="offline" when the device is offline')], dev: '<SyncStatus status="offline" />', names: ["tsc", "dev"] },
];

/** Valid sync-status snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["syncStatusOk01"];
