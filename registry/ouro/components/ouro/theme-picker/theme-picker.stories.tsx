import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemePicker, type ThemePreset } from "@/registry/ouro/components/ouro/theme-picker/theme-picker";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The stories ship no preset CSS, so the dots all paint with the page's own colours; the choice still
// shows in data-theme and in the pressed dot.

const presets: ThemePreset[] = [
  { name: "pearl", label: "Pearl", mood: "Clean white and one clear blue" },
  { name: "abyss", label: "Abyss", mood: "Pale aqua, then a cyan glow in the dark" },
  { name: "brass", label: "Brass", mood: "Warm paper and a ship's brass" },
];

const meta = {
  title: "Actions/ThemePicker",
  component: ThemePicker,
  parameters: { layout: "padded" },
  args: { presets },
} satisfies Meta<typeof ThemePicker>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. A choice sets data-theme on the page. */
export const Playground: Story = {};

/** In a footer, beside a line of text, without the description. */
export const InContext: Story = {
  render: (args) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, color: "var(--foreground)" }}>
      <Text>Field Notes</Text>
      <ThemePicker {...args} describe={false} label="Look" />
    </div>
  ),
};
