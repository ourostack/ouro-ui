import { type JSX } from "react";
import { ColorField } from "@/registry/ouro/components/ouro/color-field/color-field";

// The live demo at the top of docs/color-field/: the component as an app would use it, with its props, nothing else.

export default function ColorFieldDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <ColorField label="Accent color" name="accent" defaultValue="#3366ff" description="Used for buttons and links." />
    </form>
  );
}
