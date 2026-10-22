import { AgentNote } from "@/components/ouro/agent-note/agent-note";

async function keep(_revision: string | undefined) {
  "use server";
}

// expect: data-ouro="agent-note"
// expect: data-author="agent"
// expect: Ouro note for the person
export default function AgentNoteSection() {
  return <AgentNote text="Ouro note for the person" author="agent" name="Ouro" source="Based on 3 messages" pinned onUnpin={keep} />;
}
