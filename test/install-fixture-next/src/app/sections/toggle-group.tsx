import { ToggleGroup } from "@/components/ouro/toggle/toggle-group";

// expect: Ouro toggle group
// expect: Ouro left
// The group is named by its label, by id, in the server HTML.
// expect: role="group"
// expect: aria-labelledby="
export default function ToggleGroupSection() {
  return (
    <ToggleGroup
      label="Ouro toggle group"
      items={[
        { value: "left", label: "Ouro left" },
        { value: "right", label: "Ouro right" },
      ]}
      defaultValue="left"
      shape="pill"
      size="xs"
    />
  );
}
