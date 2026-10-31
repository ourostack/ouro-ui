// What agents write with thread-summary: snippets whose cases are in thread-summary.cases.ts.
import { ThreadSummary } from "@/registry/ouro/components/ouro/message/thread-summary";

export const threadSummary01 = <ThreadSummary count={2} onOpen={() => {}} onClick={() => {}} />;
export const threadSummary02 = <ThreadSummary count={2} onOpen={() => {}} replyCount={2} />;
export const threadSummaryOk01 = <ThreadSummary count={2} onOpen={() => {}} repliers={[{ name: "Mara Quill", src: "/mara.png" }]} lastReply="7:44 AM" lastReplyDateTime="2026-05-04T07:44" repliesLabel={(count) => `${count} replies`} replyLabel="Reply" lastReplyLabel={(time) => `Last reply ${time}`} repliersLabel="Replied" label="2 replies to Mara Quill's post" className="mt-1" />;
