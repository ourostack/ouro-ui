import { useState, type JSX } from "react";
import { AgentPresence, type ListeningAgent } from "@/registry/ouro/components/ouro/agent-presence/agent-presence";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";

// The live demo at the top of docs/agent-presence/: the component as an app would use it, with its props, nothing else.
// The agents are made up: asking one to listen adds it, and Stop drops it, as an app's own command would.

const helpers: ListeningAgent[] = [
  { id: "inbox", name: "inbox agent", doing: "listening for your name, and anything about the empty state" },
  { id: "research", name: "research agent", doing: "noting every question about pricing" },
];

export default function AgentPresenceDemo(): JSX.Element {
  const [agents, setAgents] = useState<ListeningAgent[]>([helpers[0]!]);
  const [compact, setCompact] = useState(false);
  const [unread, setUnread] = useState(false);
  const listening = (id: string) => agents.some((agent) => agent.id === id);
  return (
    <div className="grid w-full gap-4">
      <div className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3 py-2">
        <span className="flex-1 text-sm font-semibold">Design review</span>
        <AgentPresence
          label="Agents listening"
          agents={agents}
          onStop={(id) => setAgents((now) => now.filter((agent) => agent.id !== id))}
          onStopAll={() => setAgents([])}
          compact={compact}
          unread={unread}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        {helpers.map((helper) => (
          <Button
            key={helper.id}
            size="sm"
            variant="outline"
            tone="secondary"
            onClick={() => {
              if (!listening(helper.id)) setAgents((now) => [...now, helper]);
            }}
          >
            Ask {helper.name} to listen
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-6">
        <Switch label="Compact" checked={compact} onCheckedChange={setCompact} />
        <Switch label="Something new" checked={unread} onCheckedChange={setUnread} />
      </div>
    </div>
  );
}
