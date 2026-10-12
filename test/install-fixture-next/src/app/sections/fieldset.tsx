import { Field } from "@/components/ouro/field/field";
import { FieldControl } from "@/components/ouro/field/field-parts";
import { Fieldset } from "@/components/ouro/field/fieldset";

// expect: Ouro fieldset
// expect: Grouped on the server.
export default function FieldsetSection() {
  return (
    <Fieldset legend="Ouro fieldset" description="Grouped on the server.">
      <Field label="Ouro field" name="email" description="Field description" error="Field error" required>
        <FieldControl type="email" />
      </Field>
    </Fieldset>
  );
}
