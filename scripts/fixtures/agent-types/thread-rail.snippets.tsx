// What agents write with thread-rail: snippets whose cases are in thread-rail.cases.ts.
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";

export const threadRail01 = <ThreadRail label="Thread" open onClose={() => {}} />;
export const threadRail02 = <ThreadRail label="Thread" onOpenChange={() => {}} onClose={() => {}} />;
export const threadRail03 = <ThreadRail title="Replies" onClose={() => {}} />;
export const threadRailOk01 = <ThreadRail label="Thread" title="Ana's replies" detail="Design reviews" meta="2 replies" onClose={() => {}} closeLabel="Hide replies" autoFocus={false} className="w-96" />;
export const threadRailOk02 = <ThreadRail label="Thread" onClose={() => {}} initialFocus={{ current: null }} returnFocus={{ current: null }}><p>Replies</p></ThreadRail>;
