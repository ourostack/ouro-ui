import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";
import { HoverCard } from "@/registry/ouro/components/ouro/hover-card/hover-card";
import { Link } from "@/registry/ouro/components/ouro/link/link";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const body: CSSProperties = { fontWeight: 400, fontSize: "16px", lineHeight: "24px", color: "var(--foreground)", margin: 0 };
const stack: CSSProperties = { display: "grid", gap: 4 };
const name: CSSProperties = { fontWeight: 600, margin: 0 };
const muted: CSSProperties = { color: "var(--muted-foreground)", margin: 0 };

function CookSummary() {
  return (
    <div style={stack}>
      <p style={name}>Ari Mendelow</p>
      <p style={muted}>Cooks mostly Persian food. 42 recipes, 6 cookbooks.</p>
    </div>
  );
}

const meta = {
  title: "Overlays/HoverCard",
  component: HoverCard,
  parameters: { layout: "centered" },
  args: {
    trigger: <Link href="#cooks/ari">Ari Mendelow</Link>,
    children: <CookSummary />,
  },
  argTypes: {
    side: { control: "inline-radio", options: ["top", "bottom", "left", "right"] },
    align: { control: "inline-radio", options: ["start", "center", "end"] },
    trigger: { table: { disable: true } },
    children: { table: { disable: true } },
  },
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rest the mouse on the link, or focus it with the keyboard. On a phone it is only a link. */
export const Playground: Story = {};

/** In running text, the card previews where the link goes. */
export const InText: Story = {
  render: (args) => (
    <p style={{ ...body, maxWidth: 420 }}>
      This shakshuka comes from <HoverCard {...args} />, who adds preserved lemon at the end.
    </p>
  ),
};
