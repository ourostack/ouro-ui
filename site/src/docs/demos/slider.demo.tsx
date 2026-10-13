import { type JSX } from "react";
import { Slider } from "@/registry/ouro/components/ouro/slider/slider";

// The live demo at the top of docs/slider/: the component as an app would use it, with its props, nothing else.

export default function SliderDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-6" onSubmit={(event) => event.preventDefault()}>
      <Slider label="Spice level" name="spice" defaultValue={2} min={0} max={5} showValue />
      <Slider label="Price" name="price" defaultValue={[10, 40]} min={0} max={60} showValue format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} />
    </form>
  );
}
