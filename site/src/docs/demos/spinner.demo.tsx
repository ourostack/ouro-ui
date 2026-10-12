import { type JSX } from "react";
import { Spinner } from "@/registry/ouro/components/ouro/spinner/spinner";

// The live demo at the top of docs/spinner/: the component as an app would use it, with its props, nothing else.

export default function SpinnerDemo(): JSX.Element {
  return (
    <div className="flex items-center gap-6">
      <Spinner size="sm" />
      <Spinner tone="primary" label="Loading recipes" />
      <Spinner size="lg" tone="secondary" />
    </div>
  );
}
