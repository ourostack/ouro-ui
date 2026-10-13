import { type JSX } from "react";
import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";

// The live demo at the top of docs/checkbox/: the component as an app would use it, with its props, nothing else.

export default function CheckboxDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <Checkbox label="Email me new recipes" name="newsletter" defaultChecked />
      <Checkbox label="I accept the terms" name="terms" required description="You can read them first." />
    </form>
  );
}
