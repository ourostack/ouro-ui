import { type JSX } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Combobox } from "@/registry/ouro/components/ouro/combobox/combobox";

// The live demo at the top of docs/combobox/: the component as an app would use it, with its props, nothing else.

const people = [
  { value: "rowan", label: "Rowan Vale", description: "Principal Engineer", media: <Avatar name="Rowan Vale" alt="" size="xs" />, meta: <Badge>1:1</Badge> },
  { value: "iris", label: "Iris Okafor", description: "Product Designer", media: <Avatar name="Iris Okafor" alt="" size="xs" /> },
  { value: "theo", label: "Theo Brandt", description: "Support Lead", media: <Avatar name="Theo Brandt" alt="" size="xs" /> },
];

const herbs = ["Basil", "Chives", "Coriander", "Dill", "Mint", "Oregano", "Parsley", "Rosemary", "Sage", "Thyme"];

export default function ComboboxDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <Combobox label="Herb" name="herb" items={herbs} placeholder="Pick a herb" />
      <Combobox label="Herbs" name="herbs" multiple items={herbs} defaultValue={["Basil", "Mint"]} placeholder="Add a herb" />
      <Combobox label="To" name="to" multiple autoHighlight items={people} placeholder="Enter a name" />
      <Combobox label="Cuisine" name="cuisine" allowCustomValue items={["Indian", "Italian", "Mexican", "Thai"]} description="Pick one or type your own." />
    </form>
  );
}
