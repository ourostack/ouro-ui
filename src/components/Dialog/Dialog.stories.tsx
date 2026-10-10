import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";
import { Button } from "../Button/Button.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { Dialog } from "./Dialog.tsx";

// Stories are not scanned by Tailwind (see src/styles.css), so layout here uses
// inline styles and the theme's CSS variables.

const stack: CSSProperties = { display: "grid", gap: 12 };
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" };
const caption: CSSProperties = {
  font: "500 12px/16px var(--ouro-font-body)",
  color: "var(--ouro-color-ink-muted)",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
};
const body: CSSProperties = { font: "400 16px/24px var(--ouro-font-body)", color: "var(--ouro-color-ink)", margin: 0 };
const input: CSSProperties = {
  font: "400 16px/24px var(--ouro-font-body)",
  padding: "10px 12px",
  borderRadius: "var(--ouro-radius-control)",
  border: "1px solid var(--ouro-color-line)",
  background: "transparent",
  color: "var(--ouro-color-ink)",
};

function RecipeForm() {
  return (
    <div style={stack}>
      <label style={{ ...stack, gap: 6, font: "500 14px/20px var(--ouro-font-body)" }}>
        Name
        <input defaultValue="Shakshuka" style={input} />
      </label>
      <label style={{ ...stack, gap: 6, font: "500 14px/20px var(--ouro-font-body)" }}>
        Serves
        <input defaultValue="4" inputMode="numeric" style={input} />
      </label>
    </div>
  );
}

function Lines({ count }: { count: number }) {
  return (
    <div style={stack}>
      {Array.from({ length: count }, (_, index) => (
        <p key={index} style={body}>
          Step {index + 1}. Simmer the tomatoes with the peppers and spices until thick, then make wells for the eggs.
        </p>
      ))}
    </div>
  );
}

const meta = {
  title: "Overlays/Dialog",
  component: Dialog,
  parameters: { layout: "centered" },
  args: {
    title: "Edit recipe",
    trigger: <Button>Edit</Button>,
    children: <RecipeForm />,
  },
  argTypes: {
    presentation: { control: "inline-radio", options: ["auto", "dialog", "sheet"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    trigger: { table: { disable: true } },
    children: { table: { disable: true } },
    footer: { table: { disable: true } },
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Centered from 640px up; narrow the window (or open on a phone) to get the bottom sheet. */
export const Playground: Story = {};

/** `footer` holds the actions: a row at the end on wider screens, stacked on phones with the primary action at the bottom. */
export const WithFooter: Story = {
  args: {
    description: "Changes are saved to every cookbook with this recipe.",
    footer: (
      <>
        <Button variant="outline" tone="neutral">
          Cancel
        </Button>
        <Button>Save</Button>
      </>
    ),
  },
};

/** `size` caps the centered dialog's width at 24, 32 or 40rem. */
export const Sizes: Story = {
  render: () => (
    <div style={row}>
      {(["sm", "md", "lg"] as const).map((size) => (
        <Dialog key={size} title={`Size ${size}`} size={size} trigger={<Button variant="soft">{size}</Button>}>
          <Lines count={2} />
        </Dialog>
      ))}
    </div>
  ),
};

/** `presentation` fixes the form at every width. */
export const Presentations: Story = {
  render: () => (
    <div style={row}>
      {(["auto", "dialog", "sheet"] as const).map((presentation) => (
        <Dialog
          key={presentation}
          title={`presentation="${presentation}"`}
          presentation={presentation}
          trigger={<Button variant="soft">{presentation}</Button>}
        >
          <Lines count={2} />
        </Dialog>
      ))}
    </div>
  ),
};

/** Long content scrolls inside the dialog, which keeps clear of the screen edges. */
export const LongContent: Story = {
  render: () => (
    <Dialog title="Method" trigger={<Button>Show method</Button>}>
      <Lines count={24} />
    </Dialog>
  ),
};

/** `hideTitle` keeps the title as the dialog's name for screen readers. */
export const HiddenTitle: Story = {
  args: { hideTitle: true, children: <Lines count={2} /> },
};

/** `open` and `onOpenChange` put the dialog under your state. It stays open when a resize changes its form. */
export const Controlled: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <div style={row}>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <span style={caption}>{open ? "open" : "closed"}</span>
        <Dialog
          title="Controlled"
          open={open}
          onOpenChange={setOpen}
          footer={<Button onClick={() => setOpen(false)}>Done</Button>}
        >
          <p style={body}>Press Escape, tap outside or use the close button: each calls onOpenChange(false).</p>
        </Dialog>
      </div>
    );
  },
};

/** `ConfirmDialog`: Cancel has focus, an outside press does nothing, and it stays centered on phones. */
export const Confirm: Story = {
  render: () => (
    <ConfirmDialog
      title="Delete recipe?"
      description="Shakshuka will be removed from every cookbook. This can't be undone."
      confirmLabel="Delete"
      tone="danger"
      onConfirm={() => new Promise((resolve) => setTimeout(resolve, 1200))}
      trigger={
        <Button tone="danger" variant="soft">
          Delete recipe
        </Button>
      }
    />
  ),
};

/** A rejected `onConfirm` keeps the confirmation open, so the user can retry or cancel. */
export const ConfirmFailure: Story = {
  name: "Confirm (failing action)",
  render: function Render() {
    const [error, setError] = useState<string>();
    return (
      <ConfirmDialog
        title="Leave cookbook?"
        description={error ?? "You can be invited back later."}
        confirmLabel="Leave"
        onConfirm={() =>
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error("You're offline.")), 800)).catch(
            (failure: Error) => {
              setError(`${failure.message} Try again.`);
              throw failure;
            },
          )
        }
        trigger={<Button variant="outline">Leave cookbook</Button>}
      />
    );
  },
};
