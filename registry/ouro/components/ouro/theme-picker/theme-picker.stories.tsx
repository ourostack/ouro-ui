import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePicker, type ThemePreset } from "@/registry/ouro/components/ouro/theme-picker/theme-picker";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// Four small looks, defined here so each wordmark shows its own paper, ink, primary and heading face, with a muted ink
// that reads on its paper for the description. An app ships
// its own preset CSS; these use the system's faces (sans, serif, mono, rounded), so the stories load no font.
const LOOKS = `
[data-theme="paper"] { --background: #ffffff; --foreground: #1d1d1f; --muted-foreground: #5f5f64; --primary: #0066cc; --font-heading: ui-sans-serif, system-ui, sans-serif; }
[data-theme="ledger"] { --background: #f6efe0; --foreground: #2a1f14; --muted-foreground: #5e4a33; --primary: #8a531c; --font-heading: ui-serif, Georgia, "Times New Roman", serif; }
[data-theme="chart"] { --background: #eef2f7; --foreground: #13233a; --muted-foreground: #46566b; --primary: #c2410c; --font-heading: ui-monospace, "SF Mono", Menlo, monospace; }
[data-theme="tide"] { --background: #e6f6f4; --foreground: #06302c; --muted-foreground: #2f5a55; --primary: #0f766e; --font-heading: ui-rounded, "SF Pro Rounded", system-ui, sans-serif; }
.dark [data-theme="paper"], .dark[data-theme="paper"] { --background: #000000; --foreground: #f5f5f7; --muted-foreground: #a1a1a6; --primary: #2997ff; }
.dark [data-theme="ledger"], .dark[data-theme="ledger"] { --background: #1c140c; --foreground: #f3e7d3; --muted-foreground: #c2ad8e; --primary: #e0a458; }
.dark [data-theme="chart"], .dark[data-theme="chart"] { --background: #0d1626; --foreground: #e6edf7; --muted-foreground: #9fb0c6; --primary: #fb923c; }
.dark [data-theme="tide"], .dark[data-theme="tide"] { --background: #031a18; --foreground: #d5f5f0; --muted-foreground: #8cc7bf; --primary: #2dd4bf; }
`;

const presets: ThemePreset[] = [
  { name: "paper", label: "Paper", mood: "White and one clear blue" },
  { name: "ledger", label: "Ledger", mood: "Warm paper and brown ink" },
  { name: "chart", label: "Chart", mood: "Blue-grey and a signal orange" },
  { name: "tide", label: "Tide", mood: "Pale sea green" },
];

const meta = {
  title: "Actions/ThemePicker",
  component: ThemePicker,
  parameters: { layout: "padded" },
  args: { presets, defaultPreset: "ledger", storageKey: "ouro-theme-picker-story" },
  decorators: [
    (Story) => (
      <>
        <style>{LOOKS}</style>
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof ThemePicker>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The looks in a row that wraps, as in a phone's menu: Ledger chosen, so the page wears it too. */
export const Playground: Story = {
  parameters: { screenshot: { name: "theme-picker-inline", webkit: true, forcedColors: true } },
};

/** The app keeps the choice: `value` and `onValueChange`, and the page's data-theme is left alone. */
export const Controlled: Story = {
  render: function Render(args) {
    const [look, setLook] = useState("tide");
    return (
      <div data-theme={look} style={{ display: "grid", gap: 12, padding: 16, background: "var(--background)", color: "var(--foreground)" }}>
        <ThemePicker {...args} value={look} onValueChange={setLook} />
        <Text>This panel wears {look}.</Text>
      </div>
    );
  },
};

/** Behind a button that shows the chosen wordmark, as in a header; the popover holds the looks. */
export const InPopover: Story = {
  args: { presentation: "popover" },
  render: (args) => (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16, color: "var(--foreground)" }}>
      <Text>Field Notes</Text>
      <ThemePicker {...args} />
    </div>
  ),
  parameters: { screenshot: { name: "theme-picker-popover", open: true, webkit: true } },
};

/** With the chosen look's mood under the wordmarks. */
export const Described: Story = {
  args: { describe: true, size: "md" },
};
