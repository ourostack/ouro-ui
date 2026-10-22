import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { PresetPicker, type PresetPickerItem } from "@/registry/ouro/components/ouro/preset-picker/preset-picker";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16, maxWidth: 560 }}>{children}</div>;
}

const presets: PresetPickerItem[] = [
  { value: "chats", label: "Chats first", description: "Conversations wide, the calendar narrow.", tag: "Saved" },
  { value: "calendar", label: "Calendar first", description: "Today's agenda beside the conversation." },
  { value: "focus", label: "Focus", description: "One conversation, nothing else." },
  { value: "review", label: "Review", description: "Drafts waiting for you, with their sources." },
];

function Picking() {
  const [layout, setLayout] = useState("chats");
  return (
    <Surface>
      <PresetPicker label="Start from a layout" items={presets} value={layout} onValueChange={setLayout} />
    </Surface>
  );
}

const meta = {
  title: "Forms/PresetPicker",
  component: PresetPicker,
  parameters: { layout: "padded" },
  args: { label: "Start from a layout", items: presets, value: "chats", onValueChange: () => {} },
} satisfies Meta<typeof PresetPicker>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <PresetPicker {...args} />
    </Surface>
  ),
};

/** Choose a preset: it applies at once and is marked In use. The arrow keys move between cards. */
export const Choosing: Story = {
  render: () => <Picking />,
};
