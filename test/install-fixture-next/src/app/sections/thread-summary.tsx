import { ThreadSummary } from "@/components/ouro/message/thread-summary";

async function openThread() {
  "use server";
}

// expect: data-ouro="thread-summary"
// expect: Reply
export default function ThreadSummarySection() {
  return <ThreadSummary count={0} onOpen={openThread} />;
}
