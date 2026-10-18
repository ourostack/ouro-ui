import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { EditSheet } from "@/registry/ouro/components/ouro/form/edit-sheet";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";

/** Resolves with what `find` returns once it returns something, checking once a frame (a play function's wait). */
async function frameUntil<T>(find: () => T | null | undefined): Promise<T> {
  for (let frame = 0; frame < 600; frame++) {
    const found = find();
    if (found) return found;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error("the story never reached the state it shows");
}

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

/**
 * Opened by the app, with its own labels and a controlled field. Discard resets the field's
 * state in `onDiscard`, since the sheet cannot reset a value the app owns.
 */
export const Controlled: Story = {
  parameters: { plainOpeners: ["Open"] },
  args: { trigger: undefined } as never,
  render: function Render() {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("Weeknights");
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
          onDiscard={() => setName("Weeknights")}
        >
          <TextField label="Name" name="name" value={name} onValueChange={setName} required />
        </EditSheet>
      </>
    );
  },
};

/**
 * Cancel after an edit asks first: Keep editing goes back to the form, Discard closes it. The
 * story opens the sheet, renames the recipe and presses Cancel.
 */
export const DiscardPrompt: Story = {
  play: async ({ canvasElement }) => {
    const page = canvasElement.ownerDocument;
    (await frameUntil(() => canvasElement.querySelector("button"))).click();
    const name = await frameUntil(() => page.querySelector<HTMLInputElement>('input[name="name"]'));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Shakshuka with feta");
    name.dispatchEvent(new Event("input", { bubbles: true }));
    (await frameUntil(() => [...page.querySelectorAll("button")].find((button) => button.textContent === "Cancel"))).click();
    await frameUntil(() => [...page.querySelectorAll("button")].find((button) => button.textContent === "Discard"));
  },
};
