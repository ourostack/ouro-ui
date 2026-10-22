import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { LayoutProposal } from "@/registry/ouro/components/ouro/layout-proposal/layout-proposal";

// The live demo at the top of docs/layout-proposal/: the component as an app would use it, with its props, nothing else.
// The app holds one proposal and acts only on a person's click about that same proposal.

export default function LayoutProposalDemo(): JSX.Element {
  const [proposal, setProposal] = useState<string | null>("p1");
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState("");
  const decide = (applied: boolean) => (id: string, event: { isTrusted: boolean }) => {
    if (!event.isTrusted || id !== proposal) return;
    setResult(applied ? "Applied." : "Discarded.");
    setPreviewing(false);
    setProposal(null);
  };
  if (!proposal) {
    return (
      <div className="flex items-center gap-3">
        <span>{result}</span>
        <Button variant="outline" onClick={() => setProposal("p1")}>
          Show the proposal again
        </Button>
      </div>
    );
  }
  return (
    <LayoutProposal
      id={proposal}
      title="Customers first"
      by="Ouro"
      time="Just now"
      reason="You open customer chats first most mornings."
      previewing={previewing}
      onPreview={() => setPreviewing(true)}
      onEndPreview={() => setPreviewing(false)}
      onApply={decide(true)}
      onDiscard={decide(false)}
      className="max-w-2xl"
    />
  );
}
