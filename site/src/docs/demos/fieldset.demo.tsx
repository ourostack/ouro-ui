import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Field } from "@/registry/ouro/components/ouro/field/field";
import { FieldControl } from "@/registry/ouro/components/ouro/field/field-parts";
import { Fieldset } from "@/registry/ouro/components/ouro/field/fieldset";

// The live demo at the top of docs/fieldset/: the component as an app would use it, with its props, nothing else.

export default function FieldsetDemo(): JSX.Element {
  const [same, setSame] = useState(true);
  return (
    <div className="grid w-full max-w-sm gap-4">
      <Fieldset legend="Billing address" description="Where your card statements go." disabled={same}>
        <Field label="Street" name="street">
          <FieldControl autoComplete="street-address" />
        </Field>
        <Field label="City" name="city">
          <FieldControl autoComplete="address-level2" />
        </Field>
      </Fieldset>
      <div>
        <Button variant="outline" tone="secondary" onClick={() => setSame((value) => !value)}>
          {same ? "Use a different address" : "Same as shipping"}
        </Button>
      </div>
    </div>
  );
}
