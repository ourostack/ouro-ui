import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { BuildChip } from "@/registry/ouro/components/ouro/build-chip/build-chip";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const builds = [
  { id: "official", label: "Official 1.4.0" },
  { id: "w1", label: "feature/build-chip · a1b2c3d", dirty: true },
  { id: "w2", label: "fix/skew · 9e8d7c6" },
];

const meta = {
  title: "Feedback/BuildChip",
  component: BuildChip,
  parameters: { layout: "padded" },
  args: { builds, current: "w1" },
} satisfies Meta<typeof BuildChip>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = { parameters: { screenshot: { name: "build-chip-open", open: true } } };

/** The official build, with no other build running. */
export const Official: Story = { args: { current: "official" } };

/** Behind the official build, with a fix that switches back to it. */
export const Skew: Story = {
  args: {
    skew: { message: "2 commits behind main", fixLabel: "Update", onFix: () => {} },
  },
  parameters: { screenshot: { name: "build-chip-skew", open: true } },
};

/** The window's own build switches as a person chooses one. */
export const InContext: Story = { render: () => <InContextDemo /> };

function InContextDemo() {
  const [current, setCurrent] = useState("w1");
  return (
    <div style={{ display: "grid", gap: 8, color: "var(--foreground)", justifyItems: "start" }}>
      <BuildChip builds={builds} current={current} onSelect={setCurrent} />
      <p style={{ margin: 0 }}>Running: {builds.find((build) => build.id === current)?.label}</p>
    </div>
  );
}
