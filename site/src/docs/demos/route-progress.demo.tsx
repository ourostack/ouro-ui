import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { RouteProgress } from "@/registry/ouro/components/ouro/route-progress/route-progress";

// The live demo at the top of docs/route-progress/: the component as an app would use it, with its props, nothing else.

export default function RouteProgressDemo(): JSX.Element {
  const [active, setActive] = useState(false);
  return (
    // The frame's transform makes it the bar's containing block, so the fixed bar runs across the frame's top, not the page's.
    <div className="relative grid max-w-sm gap-3 overflow-hidden rounded-xl border border-border p-4 pt-6 [transform:translateZ(0)]">
      <RouteProgress active={active} />
      <Button variant="outline" onClick={() => setActive(!active)}>
        {active ? "Finish loading" : "Start loading"}
      </Button>
    </div>
  );
}
