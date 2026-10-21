import { SyncStatus } from "@/components/ouro/sync-status/sync-status";

// expect: data-ouro="sync-status"
// expect: data-status="offline"
// expect: Ouro offline status
export default function SyncStatusSection() {
  return <SyncStatus status="offline" labels={{ offline: "Ouro offline status" }} />;
}
