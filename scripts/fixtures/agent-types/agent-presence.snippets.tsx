// What agents write with agent-presence: snippets whose cases are in agent-presence.cases.ts.
import { AgentPresence, type ListeningAgent } from "@/registry/ouro/components/ouro/agent-presence/agent-presence";

const listening: ListeningAgent[] = [{ id: "inbox", name: "inbox agent", doing: "listening for your name" }];
const stop = (id: string) => void id;

export const agentPresence01 = <AgentPresence label="Agents listening" agents={listening} onStop={stop} listeners={listening} />;
export const agentPresence02 = <AgentPresence label="Agents listening" agents={listening} onStop={stop} onRemove={stop} />;
export const agentPresence03 = <AgentPresence label="Agents listening" agents={listening} onStop={stop} autoHide />;
export const agentPresence04 = <AgentPresence label="Agents listening" agents={listening} onStop={stop} variant="compact" />;
export const agentPresence05 = <AgentPresence agents={listening} onStop={stop} />;
export const agentPresenceValid = <AgentPresence label="Agents listening" agents={listening} onStop={stop} onStopAll={() => {}} size="md" compact unread labels={{ stop: "Stop" }} className="ms-auto" />;
