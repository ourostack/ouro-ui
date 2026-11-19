import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AppWindow } from "@/registry/ouro/components/ouro/app-window/app-window";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Checklist, type ChecklistItemData } from "@/registry/ouro/components/ouro/checklist/checklist";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const meta = {
  title: "Display/AppWindow",
  component: AppWindow,
  parameters: { layout: "padded" },
  args: {
    title: "tea.tsx",
    builtWith: ["Checklist", "Button"],
    children: <p style={{ margin: 0, paddingBlock: 24, color: "var(--muted-foreground)" }}>The live demo goes here.</p>,
  },
  argTypes: { inset: { control: "boolean" } },
  render: (args) => (
    <div style={{ maxWidth: 560 }}>
      <AppWindow {...args} />
    </div>
  ),
} satisfies Meta<typeof AppWindow>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

const pot: ChecklistItemData[] = [
  { id: "boil", label: "Boil the water", checked: true },
  { id: "warm", label: "Warm the pot", checked: false },
  { id: "leaves", label: "Add the leaves", checked: false },
  { id: "steep", label: "Let it steep", value: "4 min", checked: false },
];

function TeaDemo() {
  const [items, setItems] = useState(pot);
  const [code, setCode] = useState(false);
  return (
    <AppWindow
      title="tea.tsx"
      actions={
        <Button variant="plain" tone="secondary" size="sm" aria-pressed={code} onClick={() => setCode((shown) => !shown)}>
          Code
        </Button>
      }
      builtWith={["Checklist", "Button"]}
    >
      <div style={{ paddingBlock: 20, display: "grid", gap: 12 }}>
        <Checklist
          label="Make a pot of tea"
          items={items}
          onCheckedChange={(id, checked) => setItems((list) => list.map((item) => (item.id === id ? { ...item, checked } : item)))}
          onClearChecked={() => setItems((list) => list.map((item) => ({ ...item, checked: false })))}
          clearLabel="Start over"
        />
        {code ? <p style={{ margin: 0, fontSize: 14, color: "var(--muted-foreground)" }}>{'<Checklist label="Make a pot of tea" ordered items={items} />'}</p> : null}
      </div>
    </AppWindow>
  );
}

/** A portfolio's tea demo: the live checklist in the window, its file and a Code button in the bar, and what it is built with along its foot. */
export const InContext: Story = {
  render: () => (
    <div style={{ maxWidth: 560, color: "var(--foreground)" }}>
      <TeaDemo />
    </div>
  ),
};
