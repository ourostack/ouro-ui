import { type JSX } from "react";
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { Reorderable } from "@/registry/ouro/components/ouro/reorderable/reorderable";

// The live demo at the top of docs/reorderable/: the component as an app would use it, with its props, nothing else.

const steps = [
  { id: "sear", title: "Sear the ribs", text: "Brown them hard on every side." },
  { id: "soften", title: "Soften the onions", text: "Low heat, ten minutes." },
  { id: "wine", title: "Add the wine", text: "Scrape up everything stuck to the pot." },
  { id: "braise", title: "Braise", text: "Three hours at 150°C, covered." },
];

export default function ReorderableDemo(): JSX.Element {
  return (
    <div className="w-full max-w-md">
      <Reorderable
        label="Steps"
        items={steps.map((step) => ({ id: step.id, label: step.title, content: <Item title={step.title} description={step.text} /> }))}
      />
    </div>
  );
}
