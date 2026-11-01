import { type JSX } from "react";
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { ItemGroup } from "@/registry/ouro/components/ouro/item/item-group";

// The live demo at the top of docs/item-group/: the component as an app would use it, with its props, nothing else.

const recipes = [
  { slug: "short-ribs", title: "Braised short ribs", by: "Ari · 4 servings" },
  { slug: "lemon-pasta", title: "Lemon pasta", by: "Jo · 2 servings" },
  { slug: "green-curry", title: "Green curry", by: "Noor · 6 servings" },
];

export default function ItemGroupDemo(): JSX.Element {
  return (
    <ItemGroup label="Recently cooked" variant="outline" className="w-full max-w-md">
      {recipes.map((recipe) => (
        <Item key={recipe.slug} href={`#${recipe.slug}`} title={recipe.title} description={recipe.by} />
      ))}
    </ItemGroup>
  );
}
