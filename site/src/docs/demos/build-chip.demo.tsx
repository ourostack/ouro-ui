import { type JSX } from "react";
import { BuildChip } from "@/registry/ouro/components/ouro/build-chip/build-chip";

// The live demo at the top of docs/build-chip/: the component as an app would use it, with its props, nothing else.

const builds = [
  { id: "official", label: "Official 1.4.0" },
  { id: "w1", label: "feature/build-chip · a1b2c3d", dirty: true },
];

export default function BuildChipDemo(): JSX.Element {
  return <BuildChip builds={builds} current="w1" skew={{ message: "2 commits behind main", fixLabel: "Update", onFix: () => {} }} />;
}
