import { Button } from "@/components/ouro/button/button";
import { ConfirmDialog } from "@/components/ouro/dialog/confirm-dialog";
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
import { Field } from "@/components/ouro/field/field";
import { FieldControl, FieldError, FieldLabel, FieldRoot } from "@/components/ouro/field/field-parts";
import { Fieldset } from "@/components/ouro/field/fieldset";
import { Link } from "@/components/ouro/link/link";
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
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";

async function deleteRecipe() {
  "use server";
}

export default function Page() {
  return (
    <main>
      <Heading level={1}>Ouro server page</Heading>
      <Text>Rendered by a Server Component.</Text>
      <Button>Ouro button</Button>
      <Button href="/recipes">Ouro link</Button>
      <Link href="/cookbooks">Ouro text link</Link>
      <Link href="https://ouro.bot" external>
        Ouro external link
      </Link>
      <Fieldset legend="Ouro fieldset" description="Grouped on the server.">
        <Field label="Ouro field" name="email" description="Field description" error="Field error" required>
          <FieldControl type="email" />
        </Field>
      </Fieldset>
      <FieldRoot name="notes">
        <FieldLabel>Ouro parts field</FieldLabel>
        <FieldControl />
        <FieldError />
      </FieldRoot>
      <Dialog title="Edit recipe" trigger={<Button>Open dialog</Button>}>
        <Text>Dialog body</Text>
      </Dialog>
      <Sheet title="Filters" trigger={<Button>Open sheet</Button>}>
        <Text>Sheet body</Text>
      </Sheet>
      <ConfirmDialog
        title="Delete recipe?"
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={deleteRecipe}
        trigger={<Button tone="destructive">Delete</Button>}
      />
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
    </main>
  );
}
