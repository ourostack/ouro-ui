import { type JSX } from "react";
import { NumberField } from "@/registry/ouro/components/ouro/number-field/number-field";

// The live demo at the top of docs/number-field/: the component as an app would use it, with its props, nothing else.

export default function NumberFieldDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <NumberField label="Servings" name="servings" defaultValue={4} min={1} max={24} required />
      <NumberField label="Price" name="price" defaultValue={4.5} min={0} step={0.5} format={{ style: "currency", currency: "USD" }} />
      <NumberField label="Hydration" name="hydration" defaultValue={0.7} min={0} max={1} step={0.01} format={{ style: "percent" }} />
    </form>
  );
}
