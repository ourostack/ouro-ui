import { type JSX } from "react";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/text/: the component as an app would use it, with its props, nothing else.

export default function TextDemo(): JSX.Element {
  return (
    <div className="grid max-w-sm gap-2">
      <Text>Braise for three hours.</Text>
      <Text size="sm" tone="muted">
        Updated 2 days ago
      </Text>
      <Text tone="destructive">Could not save the recipe.</Text>
      <Text tone="success">Saved to Weeknights.</Text>
    </div>
  );
}
