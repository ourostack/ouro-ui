import { Item } from "@/components/ouro/item/item";

// expect: Ouro item
// expect: Ouro linked item
// expect: href="/recipes/short-ribs"
export default function ItemSection() {
  return (
    <>
      <Item title="Ouro item" description="Rendered by a Server Component" />
      <Item href="/recipes/short-ribs" title="Ouro linked item" />
    </>
  );
}
