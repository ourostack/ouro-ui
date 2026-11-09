import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { FamilyBar } from "@/registry/ouro/components/ouro/family-bar/family-bar";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed frame, a site's page. It follows the page's scheme (the `.dark` class on the root). */
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

/** The family's mark: a lantern's ring, drawn in the text colour. */
function Mark() {
  return (
    <svg role="img" aria-label="Lantern" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="10" cy="11" r="6" />
      <path d="M7 4.5h6" strokeLinecap="round" />
    </svg>
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
  title: "Navigation/FamilyBar",
  component: FamilyBar,
  parameters: { layout: "padded" },
  args: { links, current: "docs" },
} satisfies Meta<typeof FamilyBar>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Narrow the window to see the row scroll inside itself. */
export const Playground: Story = {};

/** Above a site's own header: the family's sites, this one marked, then the site's own navigation and page. */
export const InContext: Story = {
  parameters: { screenshot: { name: "family-bar" } },
  render: (args) => (
    <Surface>
      <FamilyBar {...args} brand={<Mark />} />
      <Navbar
        label="Docs"
        brand={
          <Text>
            <strong>Lantern Docs</strong>
          </Text>
        }
        items={[
          { label: "Get started", href: "#start" },
          { label: "Components", href: "#components" },
          { label: "Guides", href: "#docs-guides" },
        ]}
        currentPath="#start"
      />
      <div style={{ padding: 24, display: "grid", gap: 8 }}>
        <Heading level={1}>Get started</Heading>
        <Text>Install the kit, then add your first page.</Text>
      </div>
    </Surface>
  ),
};

/** A site far along the row: on a phone the row starts with its link in view, in the middle once the page has loaded. */
export const FarAlong: Story = {
  args: { current: "community" },
  render: (args) => (
    <Surface>
      <FamilyBar {...args} />
    </Surface>
  ),
};
