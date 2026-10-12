// What agents write with kbd: snippets whose cases are in kbd.cases.ts.
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";

export const kbd01 = <Kbd>⌘K</Kbd>;
export const kbd02 = <Kbd keys="mod+k" />;
export const kbd03 = <Kbd keys={["k"]} shortcut="mod+k" />;
export const kbdOk01 = <Kbd keys={["mod", "shift", "k"]} className="ms-2" />;
