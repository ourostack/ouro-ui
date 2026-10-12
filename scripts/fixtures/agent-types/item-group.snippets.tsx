// What agents write with item-group: snippets whose cases are in item-group.cases.ts.
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { ItemGroup } from "@/registry/ouro/components/ouro/item/item-group";

export const itemGroup01 = <ItemGroup title="Tokens"><Item title="CLI" /></ItemGroup>;
export const itemGroup02 = <ItemGroup label="Tokens" divided><Item title="CLI" /></ItemGroup>;
export const itemGroup03 = <ItemGroup label="Tokens" variant="outline" empty="No tokens"><Item title="CLI" /></ItemGroup>;
