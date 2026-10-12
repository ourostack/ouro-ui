import { Button } from "@/components/ouro/button/button";
import { Tooltip } from "@/components/ouro/tooltip/tooltip";

// expect: Ouro tooltip trigger
export default function TooltipSection() {
  return (
    <Tooltip content="Tooltip content">
      <Button>Ouro tooltip trigger</Button>
    </Tooltip>
  );
}
