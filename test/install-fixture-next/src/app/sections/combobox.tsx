import { Combobox } from "@/components/ouro/combobox/combobox";

// expect: Ouro combobox
// expect: Combobox description
// expect: Ouro multiple combobox
// The input's description id, through Field, in the server HTML.
// expect: role="combobox"[^>]*aria-describedby="[^"]*-description"
export default function ComboboxSection() {
  return (
    <>
      <Combobox label="Ouro combobox" name="herb" items={["Basil", "Dill"]} description="Combobox description" defaultValue="Dill" />
      <Combobox label="Ouro multiple combobox" name="herbs" multiple items={["Basil", "Dill"]} defaultValue={["Basil"]} />
    </>
  );
}
