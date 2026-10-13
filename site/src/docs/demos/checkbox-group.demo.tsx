import { type JSX } from "react";
import { CheckboxGroup } from "@/registry/ouro/components/ouro/checkbox/checkbox-group";

// The live demo at the top of docs/checkbox-group/: the component as an app would use it, with its props, nothing else.

export default function CheckboxGroupDemo(): JSX.Element {
  return (
    <CheckboxGroup
      legend="Herbs"
      name="herbs"
      description="Pick any you have fresh."
      defaultValue={["basil"]}
      options={[
        { value: "basil", label: "Basil", description: "Sweet and peppery." },
        { value: "mint", label: "Mint" },
        { value: "sage", label: "Sage" },
      ]}
      className="w-full max-w-sm"
    />
  );
}
