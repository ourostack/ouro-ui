// What agents write with item: snippets whose cases are in item.cases.ts.
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { Plus } from "./helpers.ts";

export const item01 = <Item title="Ribs" subtitle="Four hours" />;
export const item02 = <Item title="Ribs" icon={<Plus />} />;
export const item03 = <Item title="Ribs" action="Save" />;
export const item04 = <Item label="Ribs" description="Four hours" />;
export const item05 = <Item title="Ribs" mediaSize="xl" />;
export const item06 = <Item href="/recipes/1" title="Ribs" description="Four hours" media={<Plus />} mediaSize="icon" actions="Save" stackBelow="sm" />;
export const item07 = <Item href="/recipes/1" title="Ribs" media={<img src="/ribs.jpg" alt="" />} mediaSize="lg" mediaAbove="sm" />;
