import { ClientLayoutProposal } from "../clients/layout-proposal";

async function decide(_proposalId: string) {
  "use server";
}

// expect: data-ouro="layout-proposal"
// expect: data-proposal-id="ouro-p1"
// expect: Ouro customers first
export default function LayoutProposalSection() {
  return <ClientLayoutProposal proposalId="ouro-p1" title="Ouro customers first" by="Ouro" reason="Customer chats come first most mornings." onApply={decide} onDiscard={decide} />;
}
