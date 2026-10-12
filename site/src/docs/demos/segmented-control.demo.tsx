import { useState, type JSX } from "react";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/segmented-control/: the component as an app would use it, with its props, nothing else.

export default function SegmentedControlDemo(): JSX.Element {
  const [view, setView] = useState("list");
  return (
    <div className="grid w-full max-w-xs gap-3">
      <SegmentedControl
        label="View"
        hideLabel
        fullWidth
        value={view}
        onValueChange={setView}
        items={[
          { value: "list", label: "List" },
          { value: "grid", label: "Grid" },
          { value: "calendar", label: "Calendar" },
        ]}
      />
      <Text tone="muted">Showing this week's meals as a {view}.</Text>
    </div>
  );
}
