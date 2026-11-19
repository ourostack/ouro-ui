import { type JSX } from "react";
import { AgentHandoff } from "@/registry/ouro/components/ouro/agent-handoff/agent-handoff";

// The live demo at the top of docs/agent-handoff/: the component as an app would use it, with its props, nothing else.

export default function AgentHandoffDemo(): JSX.Element {
  return (
    <AgentHandoff
      label="Hand it to your agent"
      prompt="Add a confirm dialog to this app with Ouro UI. Read https://ui.ouroboros.bot/docs/confirm-dialog.md first and follow it."
      caption="Paste it into your coding agent's chat."
      className="w-full max-w-xl"
    />
  );
}
