import { Button } from "@/components/ouro/button/button";
import { EditSheet } from "@/components/ouro/form/edit-sheet";
import { TextField } from "@/components/ouro/text-field/text-field";

// A Server Action as onSubmit: it gets the fields as FormData and returns errors by name.
async function saveRecipe(data: FormData) {
  "use server";
  return data.get("name") ? undefined : { name: "Name the recipe." };
}

// expect: Open edit sheet
export default function EditSheetSection() {
  return (
    <EditSheet title="Edit recipe" trigger={<Button>Open edit sheet</Button>} onSubmit={saveRecipe}>
      <TextField label="Name" name="name" />
    </EditSheet>
  );
}
