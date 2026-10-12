// What agents write with scroll-area: snippets whose cases are in scroll-area.cases.ts.
import { ScrollArea } from "@/registry/ouro/components/ouro/scroll-area/scroll-area";

export const scrollArea01 = <ScrollArea type="always" className="h-72">Steps</ScrollArea>;
export const scrollArea02 = <ScrollArea maxHeight={320}>Steps</ScrollArea>;
export const scrollArea03 = <ScrollArea orientation="x">Tags</ScrollArea>;
export const scrollArea04 = <ScrollArea className="h-72" label="Method" orientation="both">Steps</ScrollArea>;
