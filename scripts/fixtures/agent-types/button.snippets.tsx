// What agents write with button: snippets whose cases are in button.cases.ts.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Plus } from "./helpers.ts";

export const s01 = <Button loading tone="primary" variant="ghost">More</Button>;
export const s02 = <Button loading tone="primary" size="icon"><Plus /></Button>;
export const s03 = <Button loading tone="danger">Delete</Button>;
export const s04 = <Button loading tone="primary" asChild><a href="/x">Go</a></Button>;
export const s05 = <Button loading tone="primary" variant="outline" size="xs">Go</Button>;
export const s29 = <Button loading type="primary">Save</Button>;
export const v01 = <Button loading tone="primary" variant="destructive">Delete</Button>;
export const v02 = <Button variant="default">Save</Button>;
export const v03 = <Button variant="secondary">Cancel</Button>;
export const v04 = <Button variant="link">Recipes</Button>;
export const v05 = <Button size="default">Save</Button>;
export const ok04 = <Button loading tone="primary" href="/x">Go</Button>;
