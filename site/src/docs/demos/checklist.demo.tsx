import { useState, type JSX } from "react";
import { Checklist, type ChecklistItemData } from "@/registry/ouro/components/ouro/checklist/checklist";

// The live demo at the top of docs/checklist/: the component as an app would use it, with its props, nothing else.
// The ingredients tick off in any order; the method is ordered, so a step ticked early says what comes first, and
// outlined, each step a card with its picture and a round tick.

const ingredients: ChecklistItemData[] = [
  { id: "oats", label: "rolled oats", value: "1 cup", checked: true },
  { id: "milk", label: "milk", description: "or oat milk", value: "1 cup", checked: false },
  { id: "chia", label: "chia seeds", value: "2 tbsp", checked: false },
  { id: "maple", label: "maple syrup", value: "1 tbsp", checked: false },
];

/** A step's picture: one stroke path, drawn in the row's tile. */
function StepIcon({ d }: { d: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const method: ChecklistItemData[] = [
  { id: "mix", label: "Mix the oats and milk", media: <StepIcon d="M4 11h16a8 8 0 0 1-16 0zM8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5" />, checked: false },
  { id: "stir", label: "Stir in the chia and maple", media: <StepIcon d="M14 4l-4 9M7 13h10a5 5 0 0 1-10 0z" />, checked: false },
  { id: "chill", label: "Cover and chill", value: "overnight", media: <StepIcon d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />, checked: false },
  { id: "top", label: "Top with berries", media: <StepIcon d="M9 15a3 3 0 1 0 0 .01M15 15a3 3 0 1 0 0 .01M12 9a3 3 0 1 0 0 .01M12 6V3" />, checked: false },
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
      <Checklist label="Method" description="Try ticking a later step first." variant="outline" ordered {...steps} />
    </div>
  );
}
