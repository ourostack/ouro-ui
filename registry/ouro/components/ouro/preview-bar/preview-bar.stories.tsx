import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { PreviewBar } from "@/registry/ouro/components/ouro/preview-bar/preview-bar";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const meta = {
  title: "Feedback/PreviewBar",
  component: PreviewBar,
  parameters: { layout: "padded" },
  args: { label: "Trying the Ocean theme", onKeep: () => {}, onDiscard: () => {}, onCompareChange: () => {} },
} satisfies Meta<typeof PreviewBar>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** A proposal that reverts itself: the countdown shows, and screen readers hear it once, with the announcement. */
export const WithCountdown: Story = { args: { seconds: 30 } };

/** The app's own proposal: the bar shows what is on screen, Compare swaps in the original, and Keep or Throw away ends the trial. */
export const InContext: Story = { render: () => <InContextDemo /> };

function InContextDemo() {
  const [open, setOpen] = useState(true);
  const [comparing, setComparing] = useState(false);
  return (
    <div style={{ maxWidth: 520, display: "grid", gap: 16, justifyItems: "start" }}>
      <div
        style={{
          justifySelf: "stretch",
          padding: 16,
          borderRadius: "var(--radius-ouro-lg, 12px)",
          border: "1px solid var(--border)",
          background: comparing || !open ? "var(--card)" : "var(--accent)",
          color: comparing || !open ? "var(--card-foreground)" : "var(--accent-foreground)",
        }}
      >
        {comparing || !open ? "The original theme" : "The Ocean theme"}
      </div>
      {open ? <PreviewBar label="Trying the Ocean theme" seconds={30} onKeep={() => setOpen(false)} onDiscard={() => setOpen(false)} onCompareChange={setComparing} /> : null}
      {/* The page's own control after the bar: where focus goes when Keep or Throw away takes the bar away. */}
      <Button variant="outline" tone="secondary" onClick={() => setOpen(true)}>
        Try the theme again
      </Button>
    </div>
  );
}
