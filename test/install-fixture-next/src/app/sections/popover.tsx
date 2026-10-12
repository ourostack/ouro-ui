import { Button } from "@/components/ouro/button/button";
import { Text } from "@/components/ouro/text/text";
import { Popover } from "@/components/ouro/popover/popover";
import {
  PopoverClose,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ouro/popover/popover-parts";

// expect: Open popover
// expect: Open parts popover
// expect: aria-haspopup="dialog"
export default function PopoverSection() {
  return (
    <>
      <Popover title="Share recipe" presentation="auto" trigger={<Button>Open popover</Button>}>
        <Text>Popover body</Text>
      </Popover>
      <PopoverRoot>
        <PopoverTrigger render={<Button>Open parts popover</Button>} />
        <PopoverPortal>
          <PopoverPositioner side="top" align="start">
            <PopoverPopup>
              <PopoverTitle>Parts popover</PopoverTitle>
              <PopoverClose render={<Button>Done</Button>} />
            </PopoverPopup>
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>
    </>
  );
}
