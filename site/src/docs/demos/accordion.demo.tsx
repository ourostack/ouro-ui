import { type JSX } from "react";
import { Accordion } from "@/registry/ouro/components/ouro/accordion/accordion";

// The live demo at the top of docs/accordion/: the component as an app would use it, with its props, nothing else.

export default function AccordionDemo(): JSX.Element {
  return (
    <Accordion
      className="max-w-md"
      defaultValue="storage"
      items={[
        { value: "storage", title: "How long does it keep?", content: "Three days in the fridge, in a covered container." },
        { value: "freeze", title: "Can I freeze it?", content: "Yes, for up to a month. Thaw it overnight in the fridge." },
        { value: "vegan", title: "Is there a vegan version?", content: "Swap the butter for olive oil and the egg for flax." },
      ]}
    />
  );
}
