import { type JSX } from "react";
import { Tabs } from "@/registry/ouro/components/ouro/tabs/tabs";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/tabs/: the component as an app would use it, with its props, nothing else.

export default function TabsDemo(): JSX.Element {
  return (
    <Tabs
      label="Recipe"
      className="w-full max-w-md"
      items={[
        { value: "ingredients", label: "Ingredients", content: <Text>2 cups flour, 1 cup water, 1 tsp salt, 1 tsp yeast.</Text> },
        { value: "method", label: "Method", content: <Text>Mix, knead for ten minutes, then let it rise until doubled.</Text> },
        { value: "notes", label: "Notes", content: <Text>The dough keeps overnight in the fridge.</Text> },
      ]}
    />
  );
}
