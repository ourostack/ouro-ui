import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Skeleton } from "@/registry/ouro/components/ouro/skeleton/skeleton";

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
        gap: 16,
        maxWidth: 420,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Feedback/Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
  argTypes: { shape: { control: "inline-radio", options: ["rect", "text", "circle"] } },
} satisfies Meta<typeof Skeleton>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** A recipe card while it loads: an avatar, two lines of text and a photo. */
export const RecipeCard: Story = {
  parameters: { screenshot: { name: "skeleton-recipe-card" } },
  render: () => (
    <Surface>
      <div aria-busy="true" aria-label="Loading recipe" role="group" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Skeleton shape="circle" />
          <div style={{ display: "grid", gap: 8, flex: 1 }}>
            <Skeleton shape="text" className="w-1/2" />
            <Skeleton shape="text" className="w-1/3" />
          </div>
        </div>
        <Skeleton className="h-40" />
        <Skeleton shape="text" />
        <Skeleton shape="text" className="w-4/5" />
      </div>
    </Surface>
  ),
};
