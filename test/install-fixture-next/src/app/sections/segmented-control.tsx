import { SegmentedControl } from "@/components/ouro/segmented-control/segmented-control";

// expect: Ouro segmented control
// expect: aria-pressed="true"
// The thumb's place comes from the pressed index, so the server HTML already has it.
// expect: --ouro-segment-index:1
export default function SegmentedControlSection() {
  return (
    <SegmentedControl
      label="Ouro segmented control"
      defaultValue="grid"
      items={[
        { value: "list", label: "List" },
        { value: "grid", label: "Grid" },
      ]}
    />
  );
}
