import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentHandoff } from "@/registry/ouro/components/ouro/agent-handoff/agent-handoff";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const meta = {
  title: "Actions/AgentHandoff",
  component: AgentHandoff,
  parameters: { layout: "padded" },
  args: {
    label: "Hand it to your agent",
    prompt: "Build this app's interface with Ouro UI. Read https://ui.ouroboros.bot/llms.txt first and follow it.",
    caption: "Paste it into your coding agent's chat.",
  },
  render: (args) => (
    <div style={{ maxWidth: 560 }}>
      <AgentHandoff {...args} />
    </div>
  ),
} satisfies Meta<typeof AgentHandoff>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. A click on Copy puts the line on the clipboard and says "Copied" for two seconds. */
export const Playground: Story = {};

/** The end of a portfolio's case study: what was built, then the line that hands it to a reader's own agent, with the release it brings in. */
export const InContext: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 560, color: "var(--foreground)" }}>
      <Heading level={2}>A tea timer, built by an agent</Heading>
      <Text tone="muted">Every control on this page is one an agent can add to your app as well.</Text>
      <AgentHandoff
        label="Hand it to your agent"
        prompt="Add a tea timer to this app with Ouro UI. Read https://ui.ouroboros.bot/docs/progress.md first and follow it."
        caption="Paste it into your coding agent's chat."
        aside={
          <Badge tone="primary" variant="soft">
            v1.0.0 · latest release
          </Badge>
        }
      />
    </div>
  ),
};

/** In a phone's column, Copy goes under the line, and the web address breaks only after a "/". */
export const Narrow: Story = {
  render: (args) => (
    <div style={{ maxWidth: 320 }}>
      <AgentHandoff {...args} />
    </div>
  ),
};
