import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Breadcrumb } from "@/registry/ouro/components/ouro/breadcrumb/breadcrumb";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";

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
      }}
    >
      {children}
    </div>
  );
}

const trail = [{ label: "Home", href: "#home" }, { label: "Recipes", href: "#recipes" }, { label: "Short ribs" }];

const long = [
  { label: "Home", href: "#home" },
  { label: "Cookbooks", href: "#cookbooks" },
  { label: "Winter", href: "#winter" },
  { label: "Braises", href: "#braises" },
  { label: "Short ribs", href: "#short-ribs" },
  { label: "Edit" },
];

const meta = {
  title: "Navigation/Breadcrumb",
  component: Breadcrumb,
  parameters: { layout: "padded" },
  args: { items: trail },
} satisfies Meta<typeof Breadcrumb>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** Above a page's title. The long trail keeps its ends and puts the middle in a menu. */
export const InContext: Story = {
  parameters: { screenshot: { name: "breadcrumb" } },
  render: (args) => (
    <Surface>
      <div style={{ display: "grid", gap: 8 }}>
        <Breadcrumb {...args} />
        <Heading level={1}>Short ribs</Heading>
      </div>
      <Breadcrumb items={long} label="Editing" />
    </Surface>
  ),
};
