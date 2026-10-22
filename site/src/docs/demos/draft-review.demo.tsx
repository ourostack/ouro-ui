import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { DraftReview, type DraftChange, type DraftReviewSegment } from "@/registry/ouro/components/ouro/draft-review/draft-review";

// The live demo at the top of docs/draft-review/: the component as an app would use it, with its props, nothing else.

const start = {
  segments: [
    { kind: "same", text: "I can meet on " },
    { kind: "delete", text: "Thursday", changeId: "day" },
    { kind: "insert", text: "Friday", changeId: "day" },
    { kind: "same", text: " at ten" },
    { kind: "insert", text: " in room 4", changeId: "room" },
    { kind: "same", text: "." },
  ] as DraftReviewSegment[],
  changes: [
    { id: "day", author: "agent", name: "Ouro", time: "2 min ago", source: "Based on 3 messages" },
    { id: "room", author: "agent", name: "Ouro", time: "1 min ago" },
  ] as DraftChange[],
};

export default function DraftReviewDemo(): JSX.Element {
  const [review, setReview] = useState(start);
  const decide = (id: string, accept: boolean) =>
    setReview((current) => ({
      segments: current.segments.flatMap((segment) =>
        segment.changeId !== id ? [segment] : (segment.kind === "insert") === accept ? [{ kind: "same" as const, text: segment.text }] : [],
      ),
      changes: current.changes.filter((change) => change.id !== id),
    }));
  if (review.changes.length === 0) {
    return (
      <div className="grid max-w-md gap-2">
        <p className="m-0">{review.segments.map((segment) => segment.text).join("")}</p>
        <Button variant="outline" onClick={() => setReview(start)}>
          Start again
        </Button>
      </div>
    );
  }
  return <DraftReview segments={review.segments} changes={review.changes} onAccept={(id) => decide(id, true)} onReject={(id) => decide(id, false)} className="max-w-md" />;
}
