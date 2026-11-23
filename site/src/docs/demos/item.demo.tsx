import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Item } from "@/registry/ouro/components/ouro/item/item";

// The live demo at the top of docs/item/: the component as an app would use it, with its props, nothing else.

export default function ItemDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-md gap-3">
      <Item variant="outline" href="#short-ribs" title="Braised short ribs" description="Four hours, mostly hands-off" chevron />
      <Item
        variant="outline"
        title="Sync token"
        description="recipes:read · Created May 2"
        actions={<Button tone="destructive" variant="soft" size="sm">Revoke</Button>}
        stackBelow="sm"
      />
      <Item
        variant="outline"
        href="#lentil-soup"
        title="Lentil soup"
        description="Its Edit shows on hover or focus"
        actions={<Button variant="plain" size="sm">Edit</Button>}
        revealActions
      />
    </div>
  );
}
