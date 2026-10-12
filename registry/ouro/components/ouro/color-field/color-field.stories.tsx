import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { ColorField } from "@/registry/ouro/components/ouro/color-field/color-field";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 24,
        display: "grid",
        gap: 24,
        maxWidth: 420,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Forms/ColorField",
  component: ColorField,
  parameters: { layout: "padded" },
  args: { label: "Accent color", name: "accent", defaultValue: "#3366ff" },
  argTypes: {
    required: { control: "boolean" },
    disabled: { control: "boolean" },
    hideLabel: { control: "boolean" },
    error: { control: "text" },
    description: { control: "text" },
  },
} satisfies Meta<typeof ColorField>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Press the swatch for the system picker, or type a hex. */
export const Playground: Story = {};

/** Described, invalid and disabled. */
export const States: Story = {
  parameters: { screenshot: { name: "color-field-states" } },
  render: () => (
    <Surface>
      <ColorField label="Accent color" name="accent" defaultValue="#3366ff" description="Used for buttons and links." />
      <ColorField label="Tag color" name="tag" defaultValue="#f5f5f4" error="Pick a darker color, so the tag text stays readable." />
      <ColorField label="Brand color" name="brand" defaultValue="#16a34a" disabled />
    </Surface>
  ),
};

/** Controlled: the color lives in the app. */
export const Controlled: Story = {
  render: function Render() {
    const [color, setColor] = useState("#e11d48");
    return (
      <Surface>
        <ColorField label="Tag color" value={color} onValueChange={setColor} />
        <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 999, background: color, color: "#fff", justifySelf: "start" }}>
          Weeknight
        </span>
      </Surface>
    );
  },
};
