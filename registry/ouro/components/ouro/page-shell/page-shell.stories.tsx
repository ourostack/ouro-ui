import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageSection, PageShell } from "@/registry/ouro/components/ouro/page-shell/page-shell";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

const meta = {
  title: "Layout/PageShell",
  component: PageShell,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageShell>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A column with two sections: resize the window to watch the gutter and the rhythm change. */
export const Playground: Story = {
  render: (args) => (
    <PageShell {...args}>
      <PageSection aria-labelledby="ps-work">
        <Heading id="ps-work" level={2}>
          Work
        </Heading>
        <Text>The column stops at 72rem, so lines stay readable on a wide screen.</Text>
      </PageSection>
      <PageSection aria-labelledby="ps-notes">
        <Heading id="ps-notes" level={2}>
          Notes
        </Heading>
        <Text>A hairline separates each section from the one before.</Text>
      </PageSection>
    </PageShell>
  ),
};
