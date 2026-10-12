import { type JSX } from "react";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/kbd/: the component as an app would use it, with its props, nothing else.

export default function KbdDemo(): JSX.Element {
  return (
    <div className="grid gap-2">
      <Text>
        Press <Kbd keys={["mod", "k"]} /> to search your recipes.
      </Text>
      <Text size="sm" tone="muted">
        <Kbd keys={["shift", "enter"]} /> adds a new line.
      </Text>
    </div>
  );
}
