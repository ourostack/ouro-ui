import { ThreadSummary } from "@/components/ouro/message/thread-summary";

// expect: data-ouro="thread-summary"
// expect: Reply
export default function ThreadSummarySection() {
  return <ThreadSummary count={0} onOpen={() => {}} />;
}
