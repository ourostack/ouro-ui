import { Separator } from "@/components/ouro/separator/separator";

// expect: data-ouro="separator"
// expect: role="separator"
// expect: ouro separator label
export default function SeparatorSection() {
  return (
    <>
      <Separator />
      <Separator label="ouro separator label" />
    </>
  );
}
