import type { Meta, StoryObj } from "@storybook/react-vite";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { StackedLayout } from "@/registry/ouro/components/ouro/sidebar/stacked-layout";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";

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

/** A page's own tools in a toolbar right under the navbar, sticking with it. */
export const WithToolbar: Story = {
  args: {
    toolbar: <Toolbar label="Week" items={[{ label: "Previous week" }, { label: "This week" }, { label: "Next week" }]} />,
    children: (
      <div style={{ display: "grid", gap: 12 }}>
        <Heading level={1}>Week of March 9</Heading>
        <Text>Five recipes planned.</Text>
        <div style={{ height: 1200 }} />
      </div>
    ),
  },
};

/** A document: the navbar scrolls away with the page. */
export const Document: Story = {
  args: {
    navbarBehavior: "static",
    children: (
      <article style={{ display: "grid", gap: 12 }}>
        <Heading level={1}>How we test recipes</Heading>
        {Array.from({ length: 12 }, (_, index) => (
          <Text key={index}>Every recipe is cooked three times, by three cooks, before it is published.</Text>
        ))}
      </article>
    ),
  },
};

/** A reading surface: art runs edge to edge, and the bars slide away while the reader scrolls down. */
export const Reader: Story = {
  args: {
    navbarBehavior: "auto-hide",
    bleed: true,
    toolbar: <Toolbar label="Reading" items={[{ label: "Previous chapter" }, { label: "Next chapter" }]} />,
    children: (
      <div style={{ display: "grid" }}>
        <div aria-hidden="true" style={{ height: 480, background: "linear-gradient(160deg, var(--primary), var(--accent))" }} />
        <div style={{ display: "grid", gap: 12, padding: 24, maxWidth: 720, marginInline: "auto" }}>
          <Heading level={1}>Chapter one</Heading>
          {Array.from({ length: 12 }, (_, index) => (
            <Text key={index}>The kitchen was quiet before dawn, and the bread had risen overnight.</Text>
          ))}
        </div>
      </div>
    ),
  },
};
