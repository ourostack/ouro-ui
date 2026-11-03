// What agents write with skeleton: snippets whose cases are in skeleton.cases.ts.
import { Skeleton } from "@/registry/ouro/components/ouro/skeleton/skeleton";

export const skeleton01 = <Skeleton variant="circular" />;
export const skeleton02 = <Skeleton width={120} />;
export const skeleton03 = <Skeleton shape="avatar" />;
export const skeletonValid = <Skeleton shape="circle" className="size-12" />;
export const skeletonValidRows = <Skeleton shape="row" count={6} />;
export const skeletonValidText = <Skeleton shape="text" size="sm" lines={3} />;
