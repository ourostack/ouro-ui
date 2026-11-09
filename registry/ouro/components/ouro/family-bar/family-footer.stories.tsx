import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { FamilyFooter } from "@/registry/ouro/components/ouro/family-bar/family-footer";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed frame, the foot of a site's page. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

const links = [
  { id: "home", label: "Lantern", href: "#lantern" },
  { id: "docs", label: "Docs", href: "#docs" },
  { id: "guides", label: "Guides", href: "#guides" },
  { id: "blog", label: "Blog", href: "#blog" },
  { id: "status", label: "Status", href: "#status" },
  { id: "community", label: "Community", href: "#community" },
  { id: "source", label: "Source", href: "#source" },
];

const meta = {
  title: "Navigation/FamilyFooter",
  component: FamilyFooter,
  parameters: { layout: "padded" },
  args: { links, current: "docs" },
} satisfies Meta<typeof FamilyFooter>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** The foot of a site's page: the family's sites in the bar's order, this one marked, then the site's own links. */
export const InContext: Story = {
  parameters: { screenshot: { name: "family-footer" } },
  render: (args) => (
    <Surface>
      <div style={{ padding: 24 }}>
        <Text>The last section of the page.</Text>
      </div>
      <FamilyFooter {...args}>
        <Link href="#privacy" tone="secondary">
          Privacy
        </Link>
        <Link href="#terms" tone="secondary">
          Terms
        </Link>
        <Text tone="muted">Made in the open.</Text>
      </FamilyFooter>
    </Surface>
  ),
};
