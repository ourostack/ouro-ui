import { type JSX } from "react";
import { Skeleton } from "@/registry/ouro/components/ouro/skeleton/skeleton";

// The live demo at the top of docs/skeleton/: the component as an app would use it, with its props, nothing else.

export default function SkeletonDemo(): JSX.Element {
  return (
    <div aria-busy="true" aria-label="Loading messages" role="group" className="grid w-full max-w-sm gap-4">
      <div>
        <Skeleton shape="row" count={3} />
      </div>
      <Skeleton shape="text" size="sm" lines={3} />
    </div>
  );
}
