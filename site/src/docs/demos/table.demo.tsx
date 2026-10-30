import { type JSX } from "react";
import { Table } from "@/registry/ouro/components/ouro/table/table";

// The live demo at the top of docs/table/: the component as an app would use it, with its props, nothing else.

const recipes = [
  { id: "short-ribs", name: "Braised short ribs", time: "4 h", minutes: 240, serves: 6 },
  { id: "herb-salad", name: "Herb salad", time: "10 min", minutes: 10, serves: 2 },
  { id: "rye", name: "Seeded rye bread", time: "18 h", minutes: 1080, serves: 8 },
];

export default function TableDemo(): JSX.Element {
  return (
    <div className="w-full max-w-xl">
      <Table
        caption="Recipes"
        columns={[
          { key: "name", header: "Recipe", sortable: true },
          { key: "time", header: "Time", sortValue: (recipe) => recipe.minutes },
          { key: "serves", header: "Serves", align: "end", sortable: true },
        ]}
        rows={recipes}
        rowHref={(recipe) => `#${recipe.id}`}
      />
    </div>
  );
}
