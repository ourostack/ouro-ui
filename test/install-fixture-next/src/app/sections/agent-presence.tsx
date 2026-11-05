import { AgentPresence } from "@/components/ouro/agent-presence/agent-presence";

async function stopListening(id: string) {
  "use server";
  void id;
}

// expect: data-ouro="agent-presence"
// AgentPresence names every agent in the chip's name in the server HTML.
// expect: aria-label="2 agents listening: Ouro inbox agent, Ouro research agent"
// expect: 2 agents listening
export default function AgentPresenceSection() {
  return (
    <AgentPresence
      label="Agents listening"
      agents={[
        { id: "inbox", name: "Ouro inbox agent", doing: "listening for your name" },
        { id: "research", name: "Ouro research agent" },
      ]}
      onStop={stopListening}
    />
  );
}
