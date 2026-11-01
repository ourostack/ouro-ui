import { type JSX } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Message } from "@/registry/ouro/components/ouro/message/message";

// The live demo at the top of docs/message/: the component as an app would use it, with its props, nothing else.

export default function MessageDemo(): JSX.Element {
  return (
    <div className="grid gap-4">
      <Message role="user" name="Ada Lovelace">
        How long should the dough rest?
      </Message>
      <Message role="assistant" name="Ouro">
        About an hour, covered, somewhere warm. It is ready when it has doubled.
      </Message>
      <Message variant="chat" role="assistant" name="Mara Quill" presence="available" presenceLabel="Available" time="9:41 AM" actions={[{ key: "like", label: "Like", icon: "👍", onClick: () => {} }]} menu={[{ label: "Copy text", onClick: () => {} }]}>
        The venue confirmed the long table for Friday.
      </Message>
      <Message variant="chat" role="assistant" name="Mara Quill" time="9:41 AM" continued>
        Can someone bring the extension cord?
      </Message>
      <Message variant="chat" role="assistant" name="Halden" nameTag="AI agent" avatar={<Avatar name="Halden" alt="" size="sm" shape="hexagon" color="neutral" />} time="9:44 AM">
        I'll post the summary of the launch notes by 4:00.
      </Message>
      <Message variant="chat" role="user" name="Priya Okafor" time="9:45 AM" footer={<span className="text-xs text-muted-foreground">Seen</span>}>
        I will bring it.
      </Message>
    </div>
  );
}
