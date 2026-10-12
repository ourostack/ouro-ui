import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { wait } from "./wait";

// The live demo at the top of docs/confirm-dialog/: the component as an app would use it, with its props, nothing else.

export default function ConfirmDialogDemo(): JSX.Element {
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
