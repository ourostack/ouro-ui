import { Skeleton } from "@/components/ouro/skeleton/skeleton";

// expect: data-ouro="skeleton"
// expect: data-shape="circle"
// expect: data-shape="row"
export default function SkeletonSection() {
  return (
    <>
      <Skeleton shape="circle" />
      <Skeleton shape="row" count={2} />
    </>
  );
}
