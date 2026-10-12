import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Field } from "@/registry/ouro/components/ouro/field/field";
import { FieldControl } from "@/registry/ouro/components/ouro/field/field-parts";

// The live demo at the top of docs/field/: the component as an app would use it, with its props, nothing else.

export default function FieldDemo(): JSX.Element {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      noValidate
      className="grid w-full max-w-sm gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const email = String(new FormData(event.currentTarget).get("email") ?? "");
        setError(/^[^@\s]+@[^@\s]+$/.test(email) ? undefined : "Enter an email address, like you@example.com.");
      }}
    >
      <Field label="Email" name="email" required description="We send the shopping list here." error={error}>
        <FieldControl type="email" placeholder="you@example.com" />
      </Field>
      <div>
        <Button type="submit">Send list</Button>
      </div>
    </form>
  );
}
