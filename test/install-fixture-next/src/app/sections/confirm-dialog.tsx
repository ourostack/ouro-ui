import { Button } from "@/components/ouro/button/button";
import { ConfirmDialog } from "@/components/ouro/dialog/confirm-dialog";

async function deleteRecipe() {
  "use server";
}

// expect: Delete
export default function ConfirmDialogSection() {
  return (
    <ConfirmDialog
      title="Delete recipe?"
      confirmLabel="Delete"
      tone="destructive"
      onConfirm={deleteRecipe}
      trigger={<Button tone="destructive">Delete</Button>}
    />
  );
}
