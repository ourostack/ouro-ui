import { AgentHandoff } from "@/components/ouro/agent-handoff/agent-handoff";

// expect: data-ouro="agent-handoff"
// expect: Ouro agent hand-off
export default function AgentHandoffSection() {
  return <AgentHandoff label="Ouro agent hand-off" prompt="Read https://ui.ouroboros.bot/llms.txt first and follow it." caption="Rendered on the server" />;
}
