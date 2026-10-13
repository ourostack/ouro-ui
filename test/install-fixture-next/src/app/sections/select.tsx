import { Select } from "@/components/ouro/select/select";
import { SelectGroup, SelectItem } from "@/components/ouro/select/select-parts";

// expect: Ouro select
// expect: Select description
// expect: Choose a course
// expect: Ouro parts select
// Select's trigger is named by the label and described by the description in the server HTML.
// expect: aria-labelledby="[^"]*-label"
// expect: aria-describedby="[^"]*-description"
// The chosen item's label, read from a `SelectItem` whose type is a client reference here.
// expect: <span[^>]*>Quick</span>
export default function SelectSection() {
  return (
    <>
      <Select label="Ouro select" name="course" placeholder="Choose a course" description="Select description" options={[{ value: "main", label: "Main" }]} />
      <Select label="Ouro parts select" name="tags" multiple defaultValue={["quick"]}>
        <SelectGroup label="Time">
          <SelectItem value="quick">Quick</SelectItem>
        </SelectGroup>
      </Select>
    </>
  );
}
