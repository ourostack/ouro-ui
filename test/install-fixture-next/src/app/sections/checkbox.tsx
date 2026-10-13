import { Checkbox } from "@/components/ouro/checkbox/checkbox";

// expect: Ouro checkbox
// expect: Checkbox description
// Checkbox names and describes its box in the server HTML.
// expect: role="checkbox"[^>]*aria-labelledby="[^"]*-label"[^>]*aria-describedby="[^"]*-description"
export default function CheckboxSection() {
  return <Checkbox label="Ouro checkbox" name="agree" description="Checkbox description" defaultChecked />;
}
