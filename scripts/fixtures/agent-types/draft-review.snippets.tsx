// What agents write with draft-review: snippets whose cases are in draft-review.cases.ts.
import { DraftReview } from "@/registry/ouro/components/ouro/draft-review/draft-review";

export const draftReview01 = <DraftReview segments={[]} changes={[]} onAccept={() => {}} onReject={() => {}} onApprove={() => {}} />;
export const draftReviewOk01 = <DraftReview segments={[{ kind: "insert", text: "Friday", changeId: "c1" }]} changes={[{ id: "c1", author: "agent", name: "Ouro", time: "2 min ago", source: "Based on 3 messages" }]} onAccept={() => {}} onReject={() => {}} onAcceptAll={() => {}} onRejectAll={() => {}} onShowSource={() => {}} label="Changes to review" heading="1 change to review" description="Since you last edited" actions={null} acceptLabel="Accept" rejectLabel="Reject" acceptAllLabel="Accept all" rejectAllLabel="Reject all" showSourceLabel="Show" agentLabel="Agent" changeLabel={(n) => `Change ${n}`} insertedLabel="added" deletedLabel="removed" className="mt-2" />;
