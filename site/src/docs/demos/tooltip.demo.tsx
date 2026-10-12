import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { PlusIcon } from "../../components/icons";

// The live demo at the top of docs/tooltip/: the component as an app would use it, with its props, nothing else.

export default function TooltipDemo(): JSX.Element {
  return (
    <div className="grid justify-items-center gap-3">
      <Tooltip content="Add to cookbook">
        <Button aria-label="Save" variant="soft">
          <PlusIcon />
        </Button>
      </Tooltip>
      <Text size="sm" tone="muted" align="center">
        Hover or focus the button. It never opens on touch.
      </Text>
    </div>
  );
}
