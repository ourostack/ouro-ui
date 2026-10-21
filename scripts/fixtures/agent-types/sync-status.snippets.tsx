// What agents write with sync-status: snippets whose cases are in sync-status.cases.ts.
import { SyncStatus } from "@/registry/ouro/components/ouro/sync-status/sync-status";

export const syncStatus01 = <SyncStatus status="saved" state="saving" />;
export const syncStatus02 = <SyncStatus status="saved" online={false} />;
export const syncStatusOk01 = <SyncStatus status="offline" labels={{ offline: "Offline" }} onRetry={() => {}} className="mt-2" />;
