import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Resizable, ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/registry/ouro/components/ouro/resizable/resizable";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

function Frame({ children, height = 240 }: { children: ReactNode; height?: number }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        overflow: "hidden",
        height,
        maxWidth: 560,
      }}
    >
      {children}
    </div>
  );
}

function Pane({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div style={{ padding: 16, display: "grid", gap: 8 }}>
      <strong style={{ fontSize: 14 }}>{title}</strong>
      <span style={{ fontSize: 14, color: "var(--muted-foreground)" }}>{children}</span>
    </div>
  );
}

const meta = {
  title: "Layout/Resizable",
  component: Resizable,
  parameters: { layout: "padded" },
  args: { children: null },
  argTypes: {
    orientation: { control: "inline-radio", options: ["horizontal", "vertical"] },
    children: { control: false },
  },
  render: (args) => (
    <Frame>
      <Resizable {...args}>
        <ResizablePanel label="Ingredients" defaultSize={35} minSize={20}>
          <Pane title="Ingredients">Eggs, tomatoes, peppers, cumin.</Pane>
        </ResizablePanel>
        <ResizablePanel label="Method">
          <Pane title="Method">Soften the peppers, add the tomatoes, then crack in the eggs.</Pane>
        </ResizablePanel>
      </Resizable>
    </Frame>
  ),
} satisfies Meta<typeof Resizable>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** Two panels side by side with a handle between. */
export const SideBySide: Story = {
  parameters: { screenshot: { name: "resizable" } },
};

/** Three stacked panels. */
export const Stacked: Story = {
  render: () => (
    <Frame height={360}>
      <Resizable orientation="vertical">
        <ResizablePanel label="Photo" defaultSize={50}>
          <Pane title="Photo" />
        </ResizablePanel>
        <ResizablePanel label="Notes">
          <Pane title="Notes" />
        </ResizablePanel>
        <ResizablePanel label="Comments">
          <Pane title="Comments" />
        </ResizablePanel>
      </Resizable>
    </Frame>
  ),
};

/** The parts, for a handle with its own label. */
export const Parts: Story = {
  render: () => (
    <Frame>
      <ResizablePanelGroup>
        <ResizablePanel label="Recipe" defaultSize={60}>
          <Pane title="Recipe" />
        </ResizablePanel>
        <ResizableHandle aria-label="Resize the recipe and the shopping list" />
        <ResizablePanel label="Shopping list">
          <Pane title="Shopping list" />
        </ResizablePanel>
      </ResizablePanelGroup>
    </Frame>
  ),
};
