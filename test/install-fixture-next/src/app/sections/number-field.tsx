import { NumberField } from "@/components/ouro/number-field/number-field";

// expect: Ouro number field
// expect: Number field description
// expect: aria-label="Increase"
// expect: aria-label="Decrease"
// expect: aria-describedby="[^"]*-description"
export default function NumberFieldSection() {
  return <NumberField label="Ouro number field" name="servings" description="Number field description" defaultValue={4} min={1} />;
}
