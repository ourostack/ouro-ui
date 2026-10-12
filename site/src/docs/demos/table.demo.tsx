import { type JSX } from "react";
import { Table } from "@/registry/ouro/components/ouro/table/table";

// The live demo at the top of docs/table/: the component as an app would use it, with its props, nothing else.

const recipes = [
  { id: "short-ribs", name: "Braised short ribs", time: "4 h", serves: 6 },
  { id: "herb-salad", name: "Herb salad", time: "10 min", serves: 2 },
  { id: "rye", name: "Seeded rye bread", time: "18 h", serves: 8 },
];

export default function TableDemo(): JSX.Element {
  return (
    <div className="w-full max-w-xl">
      <Table
        caption="Recipes"
        columns={[
          { key: "name", header: "Recipe" },
          { key: "time", header: "Time" },
          { key: "serves", header: "Serves", align: "end" },
        ]}
        rows={recipes}
        rowHref={(recipe) => `#${recipe.id}`}
      />
    </div>
  );
}
