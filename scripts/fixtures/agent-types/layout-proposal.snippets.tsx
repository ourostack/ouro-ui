// What agents write with layout-proposal: snippets whose cases are in layout-proposal.cases.ts.
import { LayoutProposal } from "@/registry/ouro/components/ouro/layout-proposal/layout-proposal";

export const layoutProposal01 = <LayoutProposal proposalId="p1" title="Customers first" by="Ouro" onApply={() => {}} onDiscard={() => {}} onAccept={() => {}} />;
export const layoutProposal02 = <LayoutProposal proposalId="p1" title="Customers first" by="Ouro" onApply={() => {}} onDiscard={() => {}} note="You open customer chats first." />;
export const layoutProposalOk01 = <LayoutProposal proposalId="p1" title="Customers first" by="Ouro" time="2 min ago" reason="You open customer chats first." previewing={false} onPreview={() => {}} onEndPreview={() => {}} onApply={() => {}} onDiscard={() => {}} proposedLabel="Proposed change" previewingLabel="Previewing" previewNote="Nothing changes until you apply it." previewLabel="Preview" endPreviewLabel="Back to current" applyLabel="Apply" discardLabel="Discard" className="mt-2" />;
