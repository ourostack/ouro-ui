import { ColorField } from "@/components/ouro/color-field/color-field";

// expect: Ouro color field
// expect: Ouro color description
// expect: type="color"
// expect: value="#3366ff"
// ColorField's description id, through Field, on the text input in the server HTML.
// expect: aria-describedby="[^"]*-description"
export default function ColorFieldSection() {
  return <ColorField label="Ouro color field" name="color" defaultValue="#3366FF" description="Ouro color description" />;
}
