import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { EditSheet } from "@/registry/ouro/components/ouro/form/edit-sheet";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";

/** A stand-in for a save: it takes a moment, and turns down the name "Pasta". */
const save = (data: FormData) =>
  new Promise<{ name: string } | undefined>((resolve) =>
    setTimeout(() => resolve(String(data.get("name")).toLowerCase() === "pasta" ? { name: "You already have a recipe called Pasta." } : undefined), 600),
  );

function Fields() {
  return (
    <>
      <TextField label="Name" name="name" defaultValue="Shakshuka" required />
      <TextField label="Serves" name="serves" inputMode="numeric" defaultValue="4" />
      <Select
        label="Course"
        name="course"
        defaultValue="main"
        options={[
          { value: "starter", label: "Starter" },
          { value: "main", label: "Main" },
          { value: "dessert", label: "Dessert" },
        ]}
      />
    </>
  );
}

const meta = {
  title: "Overlays/EditSheet",
  component: EditSheet,
  parameters: { layout: "centered" },
  args: {
    title: "Edit recipe",
    trigger: <Button>Edit</Button>,
    onSubmit: save,
    children: <Fields />,
  },
} satisfies Meta<typeof EditSheet>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Save shows loading while it works, then closes. Rename it to "Pasta" to see an error land on the name. */
export const Playground: Story = {
  parameters: { screenshot: { name: "edit-sheet-open", open: true } },
};

/** Opened by the app, with its own labels. */
export const Controlled: Story = {
  parameters: { plainOpeners: ["Open"] },
  args: { trigger: undefined } as never,
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <EditSheet
          title="Rename cookbook"
          description="Everyone you share it with sees the new name."
          submitLabel="Rename"
          open={open}
          onOpenChange={setOpen}
          onSubmit={save}
        >
          <TextField label="Name" name="name" defaultValue="Weeknights" required />
        </EditSheet>
      </>
    );
  },
};
