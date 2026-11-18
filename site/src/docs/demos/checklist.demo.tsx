import { useState, type JSX } from "react";
import { Checklist, type ChecklistItemData } from "@/registry/ouro/components/ouro/checklist/checklist";

// The live demo at the top of docs/checklist/: the component as an app would use it, with its props, nothing else.
// The ingredients tick off in any order; the method is ordered, so a step ticked early says what comes first.

const ingredients: ChecklistItemData[] = [
  { id: "oats", label: "rolled oats", value: "1 cup", checked: true },
  { id: "milk", label: "milk", description: "or oat milk", value: "1 cup", checked: false },
  { id: "chia", label: "chia seeds", value: "2 tbsp", checked: false },
  { id: "maple", label: "maple syrup", value: "1 tbsp", checked: false },
];

const method: ChecklistItemData[] = [
  { id: "mix", label: "Mix the oats and milk", checked: false },
  { id: "stir", label: "Stir in the chia and maple", checked: false },
  { id: "chill", label: "Cover and chill", value: "overnight", checked: false },
  { id: "top", label: "Top with berries", checked: false },
];

/** The rows as an app's state holds them: a toggle sets one, Clear checked unticks them all. */
function useRows(initial: ChecklistItemData[]) {
  const [items, setItems] = useState(initial);
  return {
    items,
    onCheckedChange: (id: string, checked: boolean) => setItems((list) => list.map((item) => (item.id === id ? { ...item, checked } : item))),
    onClearChecked: () => setItems((list) => list.map((item) => ({ ...item, checked: false }))),
  };
}

export default function ChecklistDemo(): JSX.Element {
  const shopping = useRows(ingredients);
  const steps = useRows(method);
  return (
    <div className="grid w-full max-w-sm gap-6">
      <Checklist label="Ingredients" {...shopping} />
      <Checklist label="Method" description="Try ticking a later step first." ordered {...steps} />
    </div>
  );
}
