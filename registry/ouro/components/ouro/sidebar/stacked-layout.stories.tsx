import type { Meta, StoryObj } from "@storybook/react-vite";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { StackedLayout } from "@/registry/ouro/components/ouro/sidebar/stacked-layout";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

const navbar = (
  <Navbar
    label="Main"
    brand={
      <Text>
        <strong>Spoonjoy</strong>
      </Text>
    }
    items={[
      { label: "Recipes", href: "/recipes" },
      { label: "Cookbooks", href: "/cookbooks" },
    ]}
    currentPath="/recipes"
  />
);

const meta = {
  title: "Navigation/StackedLayout",
  component: StackedLayout,
  parameters: { layout: "fullscreen" },
  args: {
    navbar,
    children: (
      <div style={{ display: "grid", gap: 12 }}>
        <Heading level={1}>Recipes</Heading>
        <Text>Twelve saved recipes.</Text>
      </div>
    ),
  },
} satisfies Meta<typeof StackedLayout>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** An app's shell: the navbar across the top, the page in a centered column, and a footer. */
export const InContext: Story = {
  args: { footer: "Made in a small kitchen." },
  parameters: { screenshot: { name: "stacked-layout" } },
};
