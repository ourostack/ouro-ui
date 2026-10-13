import { useState, type JSX } from "react";
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { ItemGroup } from "@/registry/ouro/components/ouro/item/item-group";
import { SwipeActions } from "@/registry/ouro/components/ouro/swipe-actions/swipe-actions";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { toast } from "@/registry/ouro/lib/ouro/toast";

// The live demo at the top of docs/swipe-actions/: the component as an app would use it, with its props, nothing else.

const recipes = ["Shakshuka", "Braised short ribs", "Lemon tart"];

export default function SwipeActionsDemo(): JSX.Element {
  const [list, setList] = useState(recipes);
  return (
    <div className="w-full max-w-md">
      <ItemGroup label="Recipes" empty="No recipes left.">
        {list.map((recipe) => (
          <SwipeActions
            key={recipe}
            label={recipe}
            leading={[{ label: "Pin", tone: "primary", onClick: () => toast(`${recipe} pinned`) }]}
            trailing={[
              {
                label: "Delete",
                tone: "destructive",
                onClick: () => {
                  setList((rows) => rows.filter((row) => row !== recipe));
                  toast(`${recipe} deleted`, { action: { label: "Undo", onClick: () => setList((rows) => recipes.filter((row) => row === recipe || rows.includes(row))) } });
                },
              },
            ]}
          >
            <Item title={recipe} description="Swipe on a touch screen, or use the actions button" />
          </SwipeActions>
        ))}
      </ItemGroup>
      <Toaster />
    </div>
  );
}
