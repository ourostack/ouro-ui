import { useState, type JSX } from "react";
import { Checklist, type ChecklistItemData } from "@/registry/ouro/components/ouro/checklist/checklist";

// The live demo at the top of docs/checklist/: the component as an app would use it, with its props, nothing else.

const ingredients: ChecklistItemData[] = [
  { id: "oats", label: "rolled oats", value: "1 cup", checked: true },
  { id: "milk", label: "milk", description: "or oat milk", value: "1 cup", checked: false },
  { id: "chia", label: "chia seeds", value: "2 tbsp", checked: false },
  { id: "maple", label: "maple syrup", value: "1 tbsp", checked: false },
];

export default function ChecklistDemo(): JSX.Element {
  const [items, setItems] = useState(ingredients);
  return (
    <Checklist
      label="Ingredients"
      className="w-full max-w-sm"
      items={items}
      onCheckedChange={(id, checked) => setItems((list) => list.map((item) => (item.id === id ? { ...item, checked } : item)))}
      onClearChecked={() => setItems((list) => list.map((item) => ({ ...item, checked: false })))}
    />
  );
}
