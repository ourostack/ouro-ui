import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { AttentionCard } from "@/registry/ouro/components/ouro/attention-card/attention-card";
import { Button } from "@/registry/ouro/components/ouro/button/button";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        padding: 16,
        display: "grid",
        gap: 12,
        maxWidth: 420,
      }}
    >
      {children}
    </div>
  );
}

function OpenDemo() {
  const [opened, setOpened] = useState("Nothing opened yet");
  return (
    <Surface>
      <AttentionCard reason="Asked you" tone="warning" title="Design review" from="Ada Lovelace" time="9:41" onOpen={() => setOpened("Opened Design review")}>
        Can you look at the second draft before noon? The layout section changed the most.
      </AttentionCard>
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted-foreground)" }}>
        {opened}
      </p>
    </Surface>
  );
}

const meta = {
  title: "Chat/AttentionCard",
  component: AttentionCard,
  parameters: { layout: "padded" },
  args: {
    reason: "Mentioned you",
    title: "Trail crew",
    from: "Grace Hopper",
    time: "8:15",
    children: "Can you bring the spare map? The ridge path is closed past the second bridge.",
  },
  argTypes: {
    tone: { control: "inline-radio", options: ["primary", "secondary", "destructive", "success", "warning"] },
  },
} satisfies Meta<typeof AttentionCard>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <AttentionCard {...args} />
    </Surface>
  ),
};

/** Reasons in their tones: a mention, a question that waits on an answer, and a quieter request. */
export const Reasons: Story = {
  render: () => (
    <Surface>
      <AttentionCard reason="Mentioned you" title="Trail crew" from="Grace Hopper" time="8:15">
        Can you bring the spare map? The ridge path is closed past the second bridge.
      </AttentionCard>
      <AttentionCard reason="Asked you" tone="warning" title="Design review" from="Ada Lovelace" time="9:41">
        Can you look at the second draft before noon?
      </AttentionCard>
      <AttentionCard reason="Waiting on you" tone="secondary" title="Garden club" from="Alan Turing" time="Tue">
        Are you still bringing tomato seedlings on Sunday?
      </AttentionCard>
    </Surface>
  ),
};

/** `onOpen` makes the message a button that opens where it happened. */
export const Opening: Story = {
  render: () => <OpenDemo />,
};

/** Buttons to act on it without opening it. */
export const Actions: Story = {
  render: () => (
    <Surface>
      <AttentionCard
        reason="Asked you"
        tone="warning"
        title="Design review"
        from="Ada Lovelace"
        time="9:41"
        onOpen={() => {}}
        actions={
          <>
            <Button size="sm">Reply</Button>
            <Button size="sm" variant="plain">
              Dismiss
            </Button>
          </>
        }
      >
        Can you look at the second draft before noon?
      </AttentionCard>
    </Surface>
  ),
};
