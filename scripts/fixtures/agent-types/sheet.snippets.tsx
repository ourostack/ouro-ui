// What agents write with sheet: snippets whose cases are in sheet.cases.ts.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { SheetRoot } from "@/registry/ouro/components/ouro/sheet/sheet-parts";
import { open, setOpen } from "./helpers.ts";

export const s12 = <Sheet title="Filters" side="bottom" isOpen={open} onClose={() => setOpen(false)}>Body</Sheet>;
export const s13 = <Sheet title="Filters" side="bottom" open={open}>Body</Sheet>;
export const s14 = <Sheet title="Filters" side="left-ish" trigger={<Button>F</Button>}>Body</Sheet>;
export const s30 = <SheetRoot side="left-ish" open={false} />;
