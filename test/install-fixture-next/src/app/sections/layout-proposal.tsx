"use client";

import { LayoutProposal } from "@/components/ouro/layout-proposal/layout-proposal";

// A client component: the handlers receive the click event, which a Server Action could not take.
// expect: data-ouro="layout-proposal"
// expect: data-proposal-id="ouro-p1"
// expect: Ouro customers first
export default function LayoutProposalSection() {
  return (
    <LayoutProposal
      proposalId="ouro-p1"
      title="Ouro customers first"
      by="Ouro"
      reason="Customer chats come first most mornings."
      onApply={() => {}}
      onDiscard={() => {}}
    />
  );
}
