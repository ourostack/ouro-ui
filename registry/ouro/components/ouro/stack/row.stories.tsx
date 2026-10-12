import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Row } from "@/registry/ouro/components/ouro/stack/row";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

function Tag({ children }: { children: ReactNode }) {
  return <span style={{ padding: "4px 12px", borderRadius: 999, background: "var(--secondary)", color: "var(--secondary-foreground)" }}>{children}</span>;
}

const meta = {
  title: "Layout/Row",
  component: Row,
  parameters: { layout: "padded" },
  args: {
    children: (
      <>
        <Tag>Braise</Tag>
        <Tag>Weeknight</Tag>
        <Tag>Make ahead</Tag>
      </>
    ),
  },
  argTypes: {
    gap: { control: "inline-radio", options: ["none", "xs", "sm", "md", "lg", "xl"] },
    align: { control: "inline-radio", options: ["start", "center", "end", "stretch", "baseline"] },
    justify: { control: "inline-radio", options: ["start", "center", "end", "between"] },
    stackBelow: { control: "inline-radio", options: [undefined, "sm", "md"] },
  },
} satisfies Meta<typeof Row>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** A header with its action at the end, wrapping tags, and buttons that stack on a phone. */
export const InContext: Story = {
  parameters: { screenshot: { name: "row" } },
  render: () => (
    <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 24 }}>
      <Stack gap="lg">
        <Row justify="between">
          <Heading level={2}>Recipes</Heading>
          <Button href="#new">New recipe</Button>
        </Row>
        <Row gap="xs" wrap>
          {["Braise", "Weeknight", "Make ahead", "Freezer friendly", "Dairy free", "One pot"].map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Row>
        <Row align="baseline" gap="sm">
          <Text size="lg">4 servings</Text>
          <Text size="sm" tone="muted">
            about 3 hours
          </Text>
        </Row>
        <Row stackBelow="sm" justify="end">
          <Button variant="outline">Cancel</Button>
          <Button>Save recipe</Button>
        </Row>
      </Stack>
    </div>
  ),
};
