import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { ThinkingBlock } from "@/registry/ouro/components/ouro/thinking-block/thinking-block";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const REASONING =
  "The person wants a dinner for six that one oven can finish at once.\n\n" +
  "The roast needs the oven at 200°C for an hour, so the sides have to share that heat or cook on the stove.\n\n" +
  "Roasted carrots fit beside the roast; the rice and the greens can go on the stove in the last twenty minutes.";

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 16,
        display: "grid",
        gap: 12,
        maxWidth: 560,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Chat/ThinkingBlock",
  component: ThinkingBlock,
  parameters: { layout: "padded" },
  args: { children: REASONING, duration: 12 },
  render: (args) => (
    <Surface>
      <ThinkingBlock {...args} />
    </Surface>
  ),
} satisfies Meta<typeof ThinkingBlock>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Finished, it is one quiet line; open it to read the reasoning. */
export const Playground: Story = {};

/** While the reasoning streams in, the block is open and its title says "Thinking" beside a spinner. */
export const Streaming: Story = {
  args: { streaming: true, children: REASONING.split("\n\n")[0] },
};

/** Finished with the agent's own summary as its title, and the reasoning open, as after the person opened it. */
export const WithSummary: Story = {
  args: { summary: "Planned the oven around the roast", defaultOpen: true },
};

/** A turn as your agent takes it: the reasoning streams, then closes to one line above the reply. */
export const InAConversation: Story = {
  render: function Render() {
    const [streaming, setStreaming] = useState(true);
    return (
      <Surface>
        <p style={{ margin: 0, justifySelf: "end", background: "var(--secondary)", color: "var(--secondary-foreground)", padding: "8px 12px", borderRadius: 16 }}>
          Can one oven cook dinner for six?
        </p>
        <ThinkingBlock streaming={streaming} duration={12}>
          {REASONING}
        </ThinkingBlock>
        {streaming ? null : <p style={{ margin: 0 }}>Yes: roast at 200°C, carrots beside it, and the rice and greens on the stove for the last twenty minutes.</p>}
        <button type="button" data-test-harness="" style={{ justifySelf: "start" }} onClick={() => setStreaming((value) => !value)}>
          {streaming ? "Finish thinking" : "Think again"}
        </button>
      </Surface>
    );
  },
};
