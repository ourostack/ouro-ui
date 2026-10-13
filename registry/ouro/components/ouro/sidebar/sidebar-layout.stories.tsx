import type { Meta, StoryObj } from "@storybook/react-vite";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { SidebarLayout } from "@/registry/ouro/components/ouro/sidebar/sidebar-layout";
import { Text } from "@/registry/ouro/components/ouro/text/text";

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

const sidebar = (
  <Sidebar
    label="Main"
    sections={sections}
    currentPath="/recipes"
    header={
      <Text>
        <strong>Spoonjoy</strong>
      </Text>
    }
  />
);

const meta = {
  title: "Navigation/SidebarLayout",
  component: SidebarLayout,
  parameters: { layout: "fullscreen" },
  args: {
    sidebar,
    children: (
      <div style={{ display: "grid", gap: 12 }}>
        <Heading level={1}>Recipes</Heading>
        <Text>Twelve saved recipes.</Text>
      </div>
    ),
  },
} satisfies Meta<typeof SidebarLayout>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** An app's shell: the sidebar beside the page, and a top bar with its menu button on a phone. */
export const InContext: Story = {
  args: { header: <Text tone="muted">Kitchen of Ari</Text> },
  parameters: { screenshot: { name: "sidebar-layout" } },
};
