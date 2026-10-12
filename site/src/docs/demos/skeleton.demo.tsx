import { type JSX } from "react";
import { Skeleton } from "@/registry/ouro/components/ouro/skeleton/skeleton";

// The live demo at the top of docs/skeleton/: the component as an app would use it, with its props, nothing else.

export default function SkeletonDemo(): JSX.Element {
  return (
    <div aria-busy="true" aria-label="Loading recipe" role="group" className="grid w-full max-w-sm gap-3">
      <div className="flex items-center gap-3">
        <Skeleton shape="circle" />
        <div className="grid flex-1 gap-2">
          <Skeleton shape="text" className="w-1/2" />
          <Skeleton shape="text" className="w-1/3" />
        </div>
      </div>
      <Skeleton className="h-32" />
    </div>
  );
}
