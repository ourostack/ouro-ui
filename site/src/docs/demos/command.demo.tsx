import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Command } from "@/registry/ouro/components/ouro/command/command";

// The live demo at the top of docs/command/: the component as an app would use it, with its props, nothing else.

const noop = () => {};

export default function CommandDemo(): JSX.Element {
  return (
    <Command
      title="Command palette"
      trigger={<Button variant="soft">Search…</Button>}
      items={[
        {
          label: "Recipes",
          items: [
            { label: "New recipe", onSelect: noop, shortcut: ["mod", "n"] },
            { label: "Import from a link", onSelect: noop, keywords: ["url"] },
          ],
        },
        { label: "Settings", items: [{ label: "Switch theme", onSelect: noop, keywords: ["dark mode"] }] },
      ]}
    />
  );
}
