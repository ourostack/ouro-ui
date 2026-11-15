import { SegmentedControl } from "@/components/ouro/segmented-control/segmented-control";

// expect: Ouro segmented control
// expect: aria-checked="true"
// The pressed segment is the thumb's anchor (CSS anchor positioning), so the server HTML already places it.
// expect: position-anchor:--ouro-segment
// expect: data-pressed=""
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
