// What agents write with relative-time: snippets whose cases are in relative-time.cases.ts.
import { RelativeTime } from "@/registry/ouro/components/ouro/relative-time/relative-time";

const createdAt = new Date("2026-06-01T09:30:00Z");

export const relativeTime01 = <RelativeTime value={createdAt} now={Date.now()} />;
export const relativeTimeOk01 = <RelativeTime value={createdAt} numeric="always" locale="en-US" className="ms-1" />;
