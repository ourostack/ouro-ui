import { type JSX } from "react";
import { ShowMore } from "@/registry/ouro/components/ouro/collapsible/show-more";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/show-more/: the component as an app would use it, with its props, nothing else.

const recipes = ["Braised short ribs", "Lemon ricotta pancakes", "Weeknight dal", "Sheet-pan gnocchi", "Miso butter salmon", "Green shakshuka"];

export default function ShowMoreDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-sm gap-6">
      <ShowMore lines={2}>
        <Text>
          Brown the short ribs in batches, then soften onions, carrots and celery in the fat. Deglaze with red wine,
          cover with stock and braise for three hours, until the meat falls from the bone.
        </Text>
      </ShowMore>
      <ShowMore maxHeight={120}>
        <div className="grid gap-2">
          <Text><strong>Menu for the harvest supper</strong></Text>
          <Text>Charred broccoli with tahini and a tomato and white bean soup, then braised short ribs over polenta.</Text>
          <Text>Bring a dish if you like: we are short on salads and bread. Pear and ginger crumble closes the night.</Text>
        </div>
      </ShowMore>
      <ShowMore initialCount={3} items={recipes.map((title) => <Text key={title}>{title}</Text>)} />
    </div>
  );
}
