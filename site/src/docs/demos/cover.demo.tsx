import { type JSX } from "react";
import { Cover } from "@/registry/ouro/components/ouro/cover/cover";

// The live demo at the top of docs/cover/: the component as an app would use it, with its props, nothing else.

export default function CoverDemo(): JSX.Element {
  return (
    <div className="flex items-end gap-4">
      <Cover title="Lemon rice" size="sm" />
      <Cover title="Green curry" />
      <Cover title="Oat cookies" size="lg" />
    </div>
  );
}
