import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Separator } from "@/registry/ouro/components/ouro/separator/separator";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/separator/: the component as an app would use it, with its props, nothing else.

export default function SeparatorDemo(): JSX.Element {
  return (
    <div className="grid max-w-sm gap-3">
      <Text>Brown the short ribs in batches.</Text>
      <Separator />
      <Text>Soften the onions in the same pot.</Text>
      <div className="flex items-center gap-2">
        <Button variant="plain" tone="secondary" size="sm">
          Edit
        </Button>
        <Separator orientation="vertical" decorative className="my-2" />
        <Button variant="plain" tone="secondary" size="sm">
          Share
        </Button>
      </div>
      <Separator label="or" />
      <Button variant="outline" tone="secondary">
        Continue with email
      </Button>
    </div>
  );
}
