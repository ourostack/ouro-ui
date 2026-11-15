import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnreadDot } from "@/registry/ouro/components/ouro/unread-dot/unread-dot";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const meta = {
  title: "Display/UnreadDot",
  component: UnreadDot,
  parameters: { layout: "padded" },
  args: { label: "Unread" },
} satisfies Meta<typeof UnreadDot>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** In a row's mark slot, beside the title it marks. */
export const InARow: Story = {
  render: (args) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--foreground)", background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 12 }}>
      <strong>Ana Lind</strong>
      <UnreadDot {...args} />
    </div>
  ),
};
