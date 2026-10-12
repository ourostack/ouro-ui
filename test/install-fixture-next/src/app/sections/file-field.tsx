import { FileField } from "@/components/ouro/file-field/file-field";

// expect: Ouro file field
// expect: Ouro file description
// expect: type="file"
// FileField's description id, through Field, on the input in the server HTML.
// expect: aria-describedby="[^"]*-description"
export default function FileFieldSection() {
  return <FileField label="Ouro file field" name="upload" accept="image/*" description="Ouro file description" />;
}
