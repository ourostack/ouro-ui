// What agents write with thread-layout: snippets whose cases are in thread-layout.cases.ts.
import { ThreadLayout } from "@/registry/ouro/components/ouro/thread-layout/thread-layout";
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";

export const threadLayout01 = <ThreadLayout conversation={<p>Replies</p>} rail={<ThreadRail label="Thread" onClose={() => {}} />} />;
export const threadLayout02 = <ThreadLayout thread={<ThreadRail label="Thread" onClose={() => {}} />} />;
export const threadLayout03 = <ThreadLayout conversation={<p>Replies</p>} className="bg-red-500" />;
export const threadLayoutOk01 = <ThreadLayout conversation={<p>Replies</p>} thread={<ThreadRail label="Thread" onClose={() => {}} />} className="h-96" />;
export const threadLayoutOk02 = <ThreadLayout conversation={<p>Replies</p>} thread={null} />;
