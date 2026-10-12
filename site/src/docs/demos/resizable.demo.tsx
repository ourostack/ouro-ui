import type { JSX } from "react";
import { Resizable, ResizablePanel } from "@/registry/ouro/components/ouro/resizable/resizable";

// The live demo at the top of docs/resizable/: the component as an app would use it, with its props, nothing else.

export default function ResizableDemo(): JSX.Element {
  return (
    <div className="h-56 w-full max-w-lg overflow-hidden rounded-lg border border-border">
      <Resizable>
        <ResizablePanel label="Ingredients" defaultSize={35} minSize={20} className="p-4">
          Ingredients
        </ResizablePanel>
        <ResizablePanel label="Method" className="p-4">
          Method
        </ResizablePanel>
      </Resizable>
    </div>
  );
}
