import { Item } from "@/components/ouro/item/item";
import { ItemGroup } from "@/components/ouro/item/item-group";

// expect: Ouro item group
// expect: Grouped item
// expect: Nothing in this group
export default function ItemGroupSection() {
  return (
    <>
      <ItemGroup label="Ouro item group">
        <Item title="Grouped item" />
      </ItemGroup>
      <ItemGroup aria-label="Empty group" empty="Nothing in this group">
        {[]}
      </ItemGroup>
    </>
  );
}
