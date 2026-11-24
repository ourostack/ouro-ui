// What agents write with build-chip: snippets whose cases are in build-chip.cases.ts.
import { BuildChip } from "@/registry/ouro/components/ouro/build-chip/build-chip";

const builds = [{ id: "official", label: "Official 1.4.0" }];

export const buildChip01 = <BuildChip builds={builds} current="official" options={["a", "b"]} />;
export const buildChip02 = <BuildChip builds={builds} current="official" skew="2 commits behind main" />;
export const buildChipOk01 = <BuildChip builds={builds} current="official" onSelect={() => {}} skew={{ message: "2 commits behind main", fixLabel: "Update", onFix: () => {} }} labels={{ group: "Build", dirty: "+ edits" }} className="ms-auto" />;
