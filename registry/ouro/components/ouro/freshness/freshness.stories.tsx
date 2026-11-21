import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Freshness } from "@/registry/ouro/components/ouro/freshness/freshness";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const meta = {
  title: "Feedback/Freshness",
  component: Freshness,
  parameters: { layout: "padded" },
  args: { updatedAt: new Date(Date.now() - 3 * 60_000), refreshing: false },
} satisfies Meta<typeof Freshness>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** The data stays on screen while the app's cache fetches it again; only this line changes. */
export const Refreshing: Story = { args: { refreshing: true } };

/** Above the data it describes, refreshed by the app's own button. */
export const InContext: Story = { render: () => <InContextDemo /> };

function InContextDemo() {
  const [updatedAt, setUpdatedAt] = useState(() => Date.now() - 5 * 60_000);
  const [refreshing, setRefreshing] = useState(false);
  return (
    <div style={{ display: "grid", gap: 8, color: "var(--foreground)", justifyItems: "start" }}>
      <Freshness updatedAt={updatedAt} refreshing={refreshing} />
      <p style={{ margin: 0 }}>3 trails open</p>
      <Button
        loading={refreshing}
        onClick={() => {
          setRefreshing(true);
          setTimeout(() => {
            setUpdatedAt(Date.now());
            setRefreshing(false);
          }, 1200);
        }}
      >
        Refresh
      </Button>
    </div>
  );
}
