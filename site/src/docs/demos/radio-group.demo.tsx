import { type JSX } from "react";
import { RadioGroup } from "@/registry/ouro/components/ouro/radio-group/radio-group";

// The live demo at the top of docs/radio-group/: the component as an app would use it, with its props, nothing else.

export default function RadioGroupDemo(): JSX.Element {
  return (
    <RadioGroup
      legend="Size"
      name="size"
      defaultValue="medium"
      options={[
        { value: "small", label: "Small", description: "Serves 2." },
        { value: "medium", label: "Medium", description: "Serves 4." },
        { value: "large", label: "Large", description: "Serves 6." },
      ]}
      className="w-full max-w-sm"
    />
  );
}
