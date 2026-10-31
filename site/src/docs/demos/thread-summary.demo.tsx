import { useState, type JSX } from "react";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { ThreadSummary } from "@/registry/ouro/components/ouro/message/thread-summary";

// The live demo at the top of docs/thread-summary/: the component as an app would use it, with its props, nothing else.

export default function ThreadSummaryDemo(): JSX.Element {
  const [opened, setOpened] = useState(false);
  return (
    <div className="grid w-full gap-2">
      <Message
        variant="post"
        role="assistant"
        name="Jonah Vale"
        time="7:30 AM"
        subject="Agenda for Friday's design review"
        thread={<ThreadSummary count={3} repliers={[{ name: "Mara Quill" }, { name: "Theo Brandt" }, { name: "Priya Okafor" }]} lastReply="7:44 AM" onOpen={() => setOpened(true)} />}
      >
        We will look at the new onboarding flow first, then the settings page.
      </Message>
      <p role="status" className="m-0 text-sm text-muted-foreground">
        {opened ? "The thread opens here." : ""}
      </p>
    </div>
  );
}
