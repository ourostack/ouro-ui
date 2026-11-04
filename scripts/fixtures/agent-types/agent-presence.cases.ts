import { type AgentCase, hint } from "./shared.ts";

/** An array or a function where a hint type stands: the compiler says the hint is missing from it. */
const missing = (value: string, fix: string) => `error TS2741: Property ''${fix}'' is missing in type '${value}' but required in type '{ '${fix}': never; }'.`;

/** The agent-presence snippets in agent-presence.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "agentPresence01", habit: "the agents as listeners", tsc: [missing("ListeningAgent[]", "Use agents={[{ id, name, doing }]}")], dev: '<AgentPresence agents={[{ id: "inbox", name: "inbox agent" }]}>', names: ["tsc", "dev"] },
  { id: "agentPresence02", habit: "Stop as onRemove", tsc: [hint("(id: string) => undefined", "Use onStop={(id) => stop(id)}")], dev: "<AgentPresence onStop={(id) => stop(id)}>", names: ["tsc", "dev"] },
  { id: "agentPresence03", habit: "a chip that hides itself", tsc: [hint("boolean", "AgentPresence never hides while an agent listens; pass agents={[]} when none does")], dev: "<AgentPresence agents={listening}>", names: ["tsc", "dev"] },
  { id: "agentPresence04", habit: "the small form as a variant", tsc: [hint("string", "Use compact for the sparkle and a count")], dev: "<AgentPresence compact>", names: ["tsc", "dev"] },
  {
    id: "agentPresence05",
    habit: "a chip with no label",
    tsc: [`error TS2741: Property 'label' is missing in type '{ agents: ListeningAgent[]; onStop: (id: string) => undefined; }' but required in type 'AgentPresenceProps'.`],
    names: ["tsc"],
  },
];

/** Valid agent-presence snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["agentPresenceValid"];
