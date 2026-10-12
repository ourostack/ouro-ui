import { Button } from "@/components/ouro/button/button";
import { Text } from "@/components/ouro/text/text";
import { Sheet } from "@/components/ouro/sheet/sheet";
import {
  SheetBackdrop,
  SheetContent,
  SheetHandle,
  SheetPopup,
  SheetPortal,
  SheetRoot,
  SheetTitle,
  SheetTrigger,
  SheetViewport,
} from "@/components/ouro/sheet/sheet-parts";

// expect: Open sheet
// expect: Open parts sheet
export default function SheetSection() {
  return (
    <>
      <Sheet title="Filters" trigger={<Button>Open sheet</Button>}>
        <Text>Sheet body</Text>
      </Sheet>
      <SheetRoot side="bottom">
        <SheetTrigger render={<Button>Open parts sheet</Button>} />
        <SheetPortal>
          <SheetBackdrop />
          <SheetViewport>
            <SheetPopup>
              <SheetHandle />
              <SheetTitle>Parts sheet</SheetTitle>
              <SheetContent>Built from the parts.</SheetContent>
            </SheetPopup>
          </SheetViewport>
        </SheetPortal>
      </SheetRoot>
    </>
  );
}
