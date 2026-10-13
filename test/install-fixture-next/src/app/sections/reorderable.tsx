import { Item } from "@/components/ouro/item/item";
import { Reorderable } from "@/components/ouro/reorderable/reorderable";

async function saveOrder(ids: string[]) {
  "use server";
  void ids;
}

// expect: data-ouro="reorderable"
// expect: aria-label="Ouro steps"
// expect: aria-label="Reorder Sear the ribs"
// expect: Ouro step content
export default function ReorderableSection() {
  return (
    <Reorderable
      label="Ouro steps"
      onReorder={saveOrder}
      items={[
        { id: "sear", label: "Sear the ribs", content: <Item title="Ouro step content" /> },
        { id: "braise", label: "Braise" },
      ]}
    />
  );
}
