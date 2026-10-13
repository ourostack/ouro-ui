import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed frame. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children, height }: { children: ReactNode; height?: number }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        overflow: "hidden",
        height,
      }}
    >
      {children}
    </div>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12H5.5A1.5 1.5 0 0 0 4 16.5v-12ZM4 16.5A1.5 1.5 0 0 0 5.5 18H16" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10 3 7 4-7 4-7-4 7-4ZM3 11l7 4 7-4" />
    </svg>
  );
}

const sections = [
  {
    items: [
      { label: "Recipes", href: "/recipes", icon: <BookIcon /> },
      { label: "Cookbooks", href: "/cookbooks", icon: <StackIcon /> },
    ],
  },
  {
    label: "Kitchen",
    items: [
      { label: "Shopping list", href: "/shopping-list" },
      { label: "Pantry", href: "/pantry" },
    ],
  },
];

const meta = {
  title: "Navigation/Sidebar",
  component: Sidebar,
  parameters: { layout: "padded" },
  args: { label: "Main", sections, currentPath: "/recipes" },
} satisfies Meta<typeof Sidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Narrow the window below 640px to see the menu button. */
export const Playground: Story = {
  render: (args) => (
    <Surface height={420}>
      <Sidebar {...args} />
    </Surface>
  ),
};

/** An app's sidebar with a header and a footer. On a phone it is a menu button that opens a drawer. */
export const InContext: Story = {
  parameters: { screenshot: { name: "sidebar" } },
  render: (args) => (
    <Surface height={480}>
      <Sidebar
        {...args}
        header={
          <Text>
            <strong>Spoonjoy</strong>
          </Text>
        }
        footer={<Text tone="muted">Ari Mendelow</Text>}
      />
    </Surface>
  ),
};

/** Collapsed to a rail of icons. A link without an icon shows its first letter. */
export const Collapsed: Story = {
  args: { defaultCollapsed: true },
  parameters: { screenshot: { name: "sidebar-collapsed" } },
  render: (args) => (
    <Surface height={420}>
      <Sidebar {...args} />
    </Surface>
  ),
};

/** A badge after a label, a button that runs an action, and links nested one level under Settings, open because it holds the current page. */
export const Items: Story = {
  args: {
    currentPath: "/settings/billing",
    sections: [
      {
        items: [
          { label: "New recipe", icon: <BookIcon />, onClick: () => {} },
          { label: "Inbox", href: "/inbox", icon: <StackIcon />, badge: 12 },
          {
            label: "Settings",
            icon: <StackIcon />,
            items: [
              { label: "Profile", href: "/settings/profile" },
              { label: "Billing", href: "/settings/billing", badge: "New" },
            ],
          },
        ],
      },
    ],
  },
  parameters: { screenshot: { name: "sidebar-items" } },
  render: (args) => (
    <Surface height={420}>
      <Sidebar {...args} />
    </Surface>
  ),
};
