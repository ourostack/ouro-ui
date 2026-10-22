import { DraftReview } from "@/components/ouro/draft-review/draft-review";

async function decide(_id: string) {
  "use server";
}

// expect: data-ouro="draft-review"
// expect: <ins
// expect: Ouro review
export default function DraftReviewSection() {
  return (
    <DraftReview
      segments={[
        { kind: "same", text: "Ouro review: meet on " },
        { kind: "insert", text: "Friday", changeId: "day" },
      ]}
      changes={[{ id: "day", author: "agent", name: "Ouro" }]}
      onAccept={decide}
      onReject={decide}
    />
  );
}
