import { CheckboxGroup } from "@/components/ouro/checkbox/checkbox-group";

// expect: Ouro checkbox group
// expect: Basil
// expect: Checkbox group error
// expect: role="group"[^>]*aria-labelledby="[^"]*-label"[^>]*aria-describedby="[^"]*-error"
export default function CheckboxGroupSection() {
  return (
    <CheckboxGroup
      legend="Ouro checkbox group"
      name="herbs"
      error="Checkbox group error"
      options={[
        { value: "basil", label: "Basil" },
        { value: "mint", label: "Mint" },
      ]}
    />
  );
}
