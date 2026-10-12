import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { EditSheet } from "@/registry/ouro/components/ouro/form/edit-sheet";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/edit-sheet/: the component as an app would use it, with its props, nothing else.

const courses = [
  { value: "starter", label: "Starter" },
  { value: "main", label: "Main" },
  { value: "dessert", label: "Dessert" },
];

// Stands in for the server: a short wait, then an error for one name.
async function saveRecipe(data: FormData) {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return data.get("name") === "Pasta" ? { name: "A recipe called Pasta already exists." } : undefined;
}

export default function EditSheetDemo(): JSX.Element {
  return (
    <div className="grid justify-items-center gap-3">
      <EditSheet title="Edit recipe" submitLabel="Save recipe" trigger={<Button variant="outline">Edit recipe</Button>} onSubmit={saveRecipe}>
        <TextField label="Name" name="name" defaultValue="Lemon ricotta pasta" required />
        <Select label="Course" name="course" defaultValue="main" options={courses} />
      </EditSheet>
      <Text size="sm" tone="muted" align="center">
        Rename it to “Pasta” to see an error land on its field.
      </Text>
    </div>
  );
}
