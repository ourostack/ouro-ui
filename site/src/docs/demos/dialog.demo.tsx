import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/dialog/: the component as an app would use it, with its props, nothing else.

export default function DialogDemo(): JSX.Element {
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
