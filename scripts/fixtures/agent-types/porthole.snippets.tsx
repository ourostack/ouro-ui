// What agents write with porthole: snippets whose cases are in porthole.cases.ts.
import { Porthole } from "@/registry/ouro/components/ouro/porthole/porthole";
import type { PortholeSnapshot, PortholeSource } from "@/registry/ouro/lib/ouro/porthole-view";

const snapshot: PortholeSnapshot = { version: 1, items: [], areas: {} };
const statusSource: PortholeSource = { getSnapshot: () => snapshot, subscribe: () => () => {}, lastBeatAt: () => 0 };

export const porthole01 = <Porthole source={statusSource} label="Status" items={[]} />;
export const porthole02 = <Porthole source={statusSource} label="Status" status="error" />;
export const portholeOk01 = <Porthole source={statusSource} label="Status" onAction={() => {}} onDismiss={() => {}} className="ms-auto" />;
