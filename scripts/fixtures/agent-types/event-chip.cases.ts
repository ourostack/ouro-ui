import { type AgentCase, hint } from "./shared.ts";

/** The event-chip snippets in event-chip.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "eventChip01", habit: "a soon flag", tsc: [hint("boolean", 'Use state="soon"')], dev: '<EventChip state="soon">', names: ["tsc", "dev"] },
  { id: "eventChip02", habit: "an onOpen callback", tsc: [hint("() => void", "Use onClick={open}, or href for a link")], dev: "<EventChip onClick={open}>", names: ["tsc", "dev"] },
];

/** Valid event-chip snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["eventChipOk01"];
