import type { JSX } from "react";
import { AgentNote } from "@/registry/ouro/components/ouro/agent-note/agent-note";
import { BriefingCard } from "@/registry/ouro/components/ouro/briefing-card/briefing-card";
import { Button } from "@/registry/ouro/components/ouro/button/button";

// The live demo at the top of docs/briefing-card/: the component as an app would use it, with its props, nothing else.

export default function BriefingCardDemo(): JSX.Element {
  return (
    <BriefingCard
      title="Weekly sync"
      detail="In 25 min · 6 people"
      status="Needs you"
      statusTone="warning"
      items={[
        { id: "chat", label: "Chat", content: "2 new · 1 asks you" },
        { id: "waiting", label: "Waiting on you", content: "The rollout numbers" },
      ]}
      note={<AgentNote text="Sam asks for the rollout numbers before the review." author="agent" name="Ouro" time="5 min ago" source="Based on 3 messages" />}
      actions={<Button size="sm">Open chat</Button>}
      className="max-w-md"
    />
  );
}
