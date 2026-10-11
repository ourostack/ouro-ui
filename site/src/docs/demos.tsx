import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Field } from "@/registry/ouro/components/ouro/field/field";
import { FieldControl } from "@/registry/ouro/components/ouro/field/field-parts";
import { Fieldset } from "@/registry/ouro/components/ouro/field/fieldset";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
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

function LinkDemo(): JSX.Element {
  return (
    <div className="grid max-w-sm gap-2">
      <Text>
        Braise as in <Link href="#braising">our braising guide</Link>, then rest overnight.
      </Text>
      <Text size="sm" tone="muted">
        Adapted from{" "}
        <Link href="https://example.com/short-ribs" external>
          the original recipe
        </Link>
        .
      </Text>
    </div>
  );
}

function FieldDemo(): JSX.Element {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      noValidate
      className="grid w-full max-w-sm gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const email = String(new FormData(event.currentTarget).get("email") ?? "");
        setError(/^[^@\s]+@[^@\s]+$/.test(email) ? undefined : "Enter an email address, like you@example.com.");
      }}
    >
      <Field label="Email" name="email" required description="We send the shopping list here." error={error}>
        <FieldControl type="email" placeholder="you@example.com" />
      </Field>
      <div>
        <Button type="submit">Send list</Button>
      </div>
    </form>
  );
}

function FieldsetDemo(): JSX.Element {
  const [same, setSame] = useState(true);
  return (
    <div className="grid w-full max-w-sm gap-4">
      <Fieldset legend="Billing address" description="Where your card statements go." disabled={same}>
        <Field label="Street" name="street">
          <FieldControl autoComplete="street-address" />
        </Field>
        <Field label="City" name="city">
          <FieldControl autoComplete="address-level2" />
        </Field>
      </Fieldset>
      <div>
        <Button variant="outline" tone="secondary" onClick={() => setSame((value) => !value)}>
          {same ? "Use a different address" : "Same as shipping"}
        </Button>
      </div>
    </div>
  );
}

function TextFieldDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <TextField label="Email" type="email" name="email" required placeholder="you@example.com" />
      <TextField label="Password" type="password" name="password" autoComplete="new-password" description="8 or more characters." />
      <TextField label="Price" name="price" inputMode="decimal" startAdornment="$" endAdornment="per jar" clearable defaultValue="4.50" />
    </form>
  );
}

function TextAreaDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-sm gap-4">
      <TextArea label="Message" name="message" autoGrow rows={2} maxRows={6} placeholder="Write to the cook" description="It grows as you type." />
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
            <Button type="submit" form="rename-recipe-form">
              Rename
            </Button>
          </>
        }
      >
        <form
          id="rename-recipe-form"
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
        >
          <label htmlFor="rename-recipe-name" className="text-sm font-medium">
            Recipe name
          </label>
          <input
            id="rename-recipe-name"
            name="name"
            type="text"
            defaultValue="Lemon ricotta pasta"
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </form>
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
  link: LinkDemo,
  field: FieldDemo,
  fieldset: FieldsetDemo,
  "text-field": TextFieldDemo,
  "text-area": TextAreaDemo,
  sheet: SheetDemo,
  dialog: DialogDemo,
  "confirm-dialog": ConfirmDialogDemo,
};
