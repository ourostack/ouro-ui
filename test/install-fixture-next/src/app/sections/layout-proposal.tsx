import { LayoutProposal } from "@/components/ouro/layout-proposal/layout-proposal";

async function decide(_id: string) {
  "use server";
}

// expect: data-ouro="layout-proposal"
// expect: data-proposal-id="ouro-p1"
// expect: Ouro customers first
export default function LayoutProposalSection() {
  return <LayoutProposal id="ouro-p1" title="Ouro customers first" by="Ouro" reason="Customer chats come first most mornings." onApply={decide} onDiscard={decide} />;
}
