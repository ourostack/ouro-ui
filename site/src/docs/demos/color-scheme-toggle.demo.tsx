import { type JSX } from "react";
import { ColorSchemeToggle } from "@/registry/ouro/components/ouro/color-scheme-toggle/color-scheme-toggle";

// The live demo at the top of docs/color-scheme-toggle/: the component as an app would use it, with its props, nothing else.

export default function ColorSchemeToggleDemo(): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ColorSchemeToggle />
      <ColorSchemeToggle variant="segmented" label="Appearance" />
    </div>
  );
}
