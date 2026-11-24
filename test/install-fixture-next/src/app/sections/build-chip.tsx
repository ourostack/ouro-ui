import { BuildChip } from "@/components/ouro/build-chip/build-chip";

// expect: data-ouro="build-chip"
// expect: Official 1.4.0
export default function BuildChipSection() {
  return <BuildChip builds={[{ id: "official", label: "Official 1.4.0" }]} current="official" />;
}
