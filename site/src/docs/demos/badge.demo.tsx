import { useState, type JSX } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";

// The live demo at the top of docs/badge/: the component as an app would use it, with its props, nothing else.

export default function BadgeDemo(): JSX.Element {
  const [vegan, setVegan] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Draft</Badge>
      <Badge tone="success" variant="soft">
        Published
      </Badge>
      <Badge href="#braise" variant="outline">
        Braise
      </Badge>
      <Badge onClick={() => setVegan(!vegan)} aria-pressed={vegan} tone={vegan ? "primary" : "secondary"} variant={vegan ? "solid" : "outline"}>
        Vegan
      </Badge>
    </div>
  );
}
