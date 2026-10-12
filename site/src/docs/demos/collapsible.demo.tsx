import { type JSX } from "react";
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/collapsible/: the component as an app would use it, with its props, nothing else.

export default function CollapsibleDemo(): JSX.Element {
  return (
    <Collapsible title="Nutrition facts" className="max-w-sm">
      <Text>Per serving: 420 calories, 18g protein, 12g fat, 54g carbohydrate.</Text>
    </Collapsible>
  );
}
