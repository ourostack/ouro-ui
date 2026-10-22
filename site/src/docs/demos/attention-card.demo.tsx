import { useState, type JSX } from "react";
import { AttentionCard } from "@/registry/ouro/components/ouro/attention-card/attention-card";
import { Button } from "@/registry/ouro/components/ouro/button/button";

// The live demo at the top of docs/attention-card/: the component as an app would use it, with its props, nothing else.

export default function AttentionCardDemo(): JSX.Element {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) {
    return (
      <Button variant="outline" onClick={() => setDismissed(false)}>
        Show the request again
      </Button>
    );
  }
  return (
    <AttentionCard
      reason="Asked you"
      tone="warning"
      title="Design review"
      from="Ada Lovelace"
      time="9:41"
      onOpen={() => {}}
      actions={
        <Button size="sm" variant="plain" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      }
      className="max-w-md"
    >
      Can you look at the second draft before noon?
    </AttentionCard>
  );
}
