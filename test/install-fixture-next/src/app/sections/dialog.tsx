import { Button } from "@/components/ouro/button/button";
import { Text } from "@/components/ouro/text/text";
import { Dialog } from "@/components/ouro/dialog/dialog";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  DialogViewport,
} from "@/components/ouro/dialog/dialog-parts";

// expect: Open dialog
// expect: Open parts dialog
export default function DialogSection() {
  return (
    <>
      <Dialog title="Edit recipe" trigger={<Button>Open dialog</Button>}>
        <Text>Dialog body</Text>
      </Dialog>
      <DialogRoot>
        <DialogTrigger render={<Button>Open parts dialog</Button>} />
        <DialogPortal>
          <DialogBackdrop />
          <DialogViewport>
            <DialogPopup size="sm">
              <DialogTitle>Parts dialog</DialogTitle>
              <DialogContent>Built from the parts.</DialogContent>
              <DialogFooter>
                <DialogClose render={<Button>Done</Button>} />
              </DialogFooter>
            </DialogPopup>
          </DialogViewport>
        </DialogPortal>
      </DialogRoot>
    </>
  );
}
