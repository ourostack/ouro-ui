// What agents write with porthole: snippets whose cases are in porthole.cases.ts.
import { Porthole } from "@/registry/ouro/components/ouro/porthole/porthole";
import type { PortholeSource } from "@/registry/ouro/lib/ouro/porthole-view";

declare const statusSource: PortholeSource;

export const porthole01 = <Porthole source={statusSource} label="Status" items={[]} />;
export const porthole02 = <Porthole source={statusSource} label="Status" status="error" />;
export const portholeOk01 = <Porthole source={statusSource} label="Status" onAction={() => {}} onDismiss={() => {}} className="ms-auto" />;
