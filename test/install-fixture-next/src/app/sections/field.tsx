import { Field } from "@/components/ouro/field/field";
import { FieldControl, FieldError, FieldLabel, FieldRoot } from "@/components/ouro/field/field-parts";

// expect: Ouro field
// expect: Field description
// expect: Field error
// expect: Ouro parts field
// Field's wiring in the server HTML.
// expect: aria-describedby="[^"]*-description [^"]*-error"
export default function FieldSection() {
  return (
    <>
      <Field label="Ouro field" name="contact-email" description="Field description" error="Field error" required>
        <FieldControl type="email" />
      </Field>
      <FieldRoot name="notes">
        <FieldLabel>Ouro parts field</FieldLabel>
        <FieldControl />
        <FieldError />
      </FieldRoot>
    </>
  );
}
