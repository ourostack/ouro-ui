import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";

// The live demo at the top of docs/popover/: the component as an app would use it, with its props, nothing else.

export default function PopoverDemo(): JSX.Element {
  return (
    <Popover
      title="Share recipe"
      description="Anyone with the link can view it."
      presentation="auto"
      trigger={<Button variant="soft">Share</Button>}
    >
      <TextField label="Link" defaultValue="https://spoonjoy.app/r/shakshuka" readOnly />
    </Popover>
  );
}
