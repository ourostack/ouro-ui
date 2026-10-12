import { type JSX } from "react";
import { Combobox } from "@/registry/ouro/components/ouro/combobox/combobox";

// The live demo at the top of docs/combobox/: the component as an app would use it, with its props, nothing else.

const herbs = ["Basil", "Chives", "Coriander", "Dill", "Mint", "Oregano", "Parsley", "Rosemary", "Sage", "Thyme"];

export default function ComboboxDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <Combobox label="Herb" name="herb" items={herbs} placeholder="Pick a herb" />
      <Combobox label="Herbs" name="herbs" multiple items={herbs} defaultValue={["Basil", "Mint"]} placeholder="Add a herb" />
      <Combobox label="Cuisine" name="cuisine" allowCustomValue items={["Indian", "Italian", "Mexican", "Thai"]} description="Pick one or type your own." />
    </form>
  );
}
