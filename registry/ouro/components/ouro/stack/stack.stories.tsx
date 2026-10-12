import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

function Box({ children }: { children: ReactNode }) {
  return <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--secondary)", color: "var(--secondary-foreground)" }}>{children}</div>;
}

const meta = {
  title: "Layout/Stack",
  component: Stack,
  parameters: { layout: "padded" },
  args: {
    children: (
      <>
        <Box>Sear</Box>
        <Box>Braise</Box>
        <Box>Rest</Box>
      </>
    ),
  },
  argTypes: {
    gap: { control: "inline-radio", options: ["none", "xs", "sm", "md", "lg", "xl"] },
    align: { control: "inline-radio", options: ["start", "center", "end", "stretch"] },
    justify: { control: "inline-radio", options: ["start", "center", "end", "between"] },
  },
} satisfies Meta<typeof Stack>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** A section's heading, text and action, spaced with gaps instead of margins, and the gap scale. */
export const InContext: Story = {
  parameters: { screenshot: { name: "stack" } },
  render: () => (
    <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 24 }}>
      <Stack gap="xl">
        <Stack gap="sm" align="start">
          <Heading level={2}>Short ribs</Heading>
          <Text tone="muted">Seared hard, braised low, rested overnight.</Text>
          <Button>Start cooking</Button>
        </Stack>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))" }}>
          {(["xs", "sm", "md", "lg"] as const).map((gap) => (
            <Stack key={gap} gap={gap}>
              <Box>gap {gap}</Box>
              <Box>Braise</Box>
            </Stack>
          ))}
        </div>
      </Stack>
    </div>
  ),
};
