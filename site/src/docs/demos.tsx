import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { CheckIcon, PlusIcon } from "../components/icons";

// The live demo at the top of each docs page: the component as an app would use it,
// with its props, nothing else.

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function ButtonDemo(): JSX.Element {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button
        loading={saving}
        loadingLabel="Saving recipe"
        onClick={() => {
          setSaving(true);
          void wait(1600).then(() => setSaving(false));
        }}
      >
        Save recipe
      </Button>
      <Button variant="soft" startIcon={PlusIcon}>
        Add step
      </Button>
      <Button variant="outline" tone="secondary">
        Cancel
      </Button>
      <Button variant="soft" tone="destructive">
        Delete
      </Button>
    </div>
  );
}

function TextDemo(): JSX.Element {
  return (
    <div className="grid max-w-sm gap-2">
      <Text>Braise for three hours.</Text>
      <Text size="sm" tone="muted">
        Updated 2 days ago
      </Text>
      <Text tone="destructive">Could not save the recipe.</Text>
      <Text tone="success">Saved to Weeknights.</Text>
    </div>
  );
}

function HeadingDemo(): JSX.Element {
  return (
    <div className="grid max-w-sm gap-3">
      <Heading level={2}>Recipes</Heading>
      <Heading level={3}>Ingredients</Heading>
      <Heading level={4}>For the sauce</Heading>
    </div>
  );
}

function CookbookList(): JSX.Element {
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set(["Weeknights"]));
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {["Weeknights", "Summer", "For guests"].map((name) => {
        const on = saved.has(name);
        return (
          <li key={name}>
            <Button
              fullWidth
              variant={on ? "soft" : "outline"}
              tone={on ? "primary" : "secondary"}
              startIcon={on ? CheckIcon : PlusIcon}
              aria-pressed={on}
              onClick={() =>
                setSaved((current) => {
                  const next = new Set(current);
                  if (!next.delete(name)) next.add(name);
                  return next;
                })
              }
            >
              {name}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function SheetDemo(): JSX.Element {
  return (
    <Sheet title="Save to cookbook" description="Pick one or more." trigger={<Button>Save to cookbook</Button>}>
      <CookbookList />
    </Sheet>
  );
}

function DialogDemo(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid justify-items-center gap-3">
      <Dialog
        title="Rename recipe"
        description="The new name shows everywhere the recipe does."
        open={open}
        onOpenChange={setOpen}
        footer={
          <>
            <Button variant="outline" tone="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Rename</Button>
          </>
        }
      >
        <Text>Lemon ricotta pasta</Text>
      </Dialog>
      <Button onClick={() => setOpen(true)}>Rename recipe</Button>
      <Text size="sm" tone="muted" align="center">
        A centered dialog from 640px up, a sheet you can drag away below it.
      </Text>
    </div>
  );
}

function ConfirmDialogDemo(): JSX.Element {
  return (
    <ConfirmDialog
      title="Delete recipe?"
      description="This can't be undone."
      confirmLabel="Delete"
      tone="destructive"
      onConfirm={() => wait(1200)}
      trigger={
        <Button tone="destructive" variant="soft">
          Delete recipe
        </Button>
      }
    />
  );
}

export const demos: Record<string, () => JSX.Element> = {
  button: ButtonDemo,
  text: TextDemo,
  heading: HeadingDemo,
  sheet: SheetDemo,
  dialog: DialogDemo,
  "confirm-dialog": ConfirmDialogDemo,
};
