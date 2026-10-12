import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type ReactNode } from "react";
import { Progress } from "@/registry/ouro/components/ouro/progress/progress";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

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
  title: "Feedback/Progress",
  component: Progress,
  parameters: { layout: "padded" },
  args: { label: "Uploading photos", value: 40, showValue: true },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 100 } },
    tone: { control: "inline-radio", options: ["primary", "secondary", "destructive", "success", "warning"] },
  },
} satisfies Meta<typeof Progress>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** Determinate bars with their values, an indeterminate one, and one with a hidden label. */
export const States: Story = {
  parameters: { screenshot: { name: "progress-states" } },
  render: () => (
    <Surface>
      <Progress label="Uploading photos" value={40} showValue />
      <Progress label="Steps done" value={3} max={4} showValue format={{ style: "decimal" }} tone="success" />
      <Progress label="Importing recipes" value={null} />
      <Progress label="Storage almost full" value={92} showValue tone="warning" />
      <Progress label="Hidden label" hideLabel value={65} />
    </Surface>
  ),
};

function Advancing() {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setValue((current) => (current >= 100 ? 0 : current + 10)), 600);
    return () => clearInterval(timer);
  }, []);
  return <Progress label="Uploading" value={value} showValue />;
}

/** A bar that advances, to see the fill ease to each value. */
export const Advances: Story = {
  render: () => (
    <Surface>
      <Advancing />
    </Surface>
  ),
};
