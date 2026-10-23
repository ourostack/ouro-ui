"use client";

import { LayoutProposal, type LayoutProposalProps } from "@/components/ouro/layout-proposal/layout-proposal";

type Decide = (proposalId: string) => Promise<void>;

// The handlers receive the click event, which a Server Action cannot take: this client component
// checks it is a person's click and passes the Server Action only the proposal's id.
export function ClientLayoutProposal({ onApply, onDiscard, ...props }: Omit<LayoutProposalProps, "onApply" | "onDiscard" | "onPreview" | "onEndPreview"> & { onApply: Decide; onDiscard: Decide }) {
  return <LayoutProposal {...props} onApply={(proposalId, event) => event.isTrusted && onApply(proposalId)} onDiscard={(proposalId, event) => event.isTrusted && onDiscard(proposalId)} />;
}
