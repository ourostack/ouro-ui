import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { RingCard } from "@/registry/ouro/components/ouro/ring-card/ring-card";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";

const meta = {
  title: "Chat/RingCard",
  component: RingCard,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ width: "100%", maxWidth: 352 }}><Story /></div>],
  args: {
    caller: "Mara Vale",
    kind: "video",
    note: "Shall we take the scenic route?",
    announcement: "Mara Vale is calling with video.",
    onDecline: () => {},
    onAudio: () => {},
    onVideo: () => {},
  },
} satisfies Meta<typeof RingCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const AudioCall: Story = { args: { kind: "audio", announcement: "Mara Vale is calling with audio.", note: undefined } };
export const Shortcuts: Story = { args: { keys: { decline: "Esc", audio: "Shift+A", video: "Shift+V" } } };
export const QuietAlternatives: Story = { args: { chips: <Text as="div" size="sm" tone="muted"><Button size="inline" tone="secondary" variant="plain">Message instead</Button></Text> } };
export const Connecting: Story = { args: { announcement: "", pending: { label: "Connecting...", media: "video" } } };
export const Declining: Story = { args: { announcement: "", pending: { label: "Declining...", media: null } } };
export const Failure: Story = {
  args: {
    announcement: "",
    failure: {
      title: "Couldn't answer here",
      line: "The call is still ringing in your calling app.",
      action: <Button fullWidth>Open calling app</Button>,
      announcement: "Couldn't answer here. Open your calling app to answer.",
    },
  },
};

function AnsweringDemo() {
  const [pending, setPending] = useState<{ label: string; media: "audio" | "video" | null } | null>(null);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <TextField label="Your draft" name="draft" defaultValue="Meet you by the old bridge" />
      <RingCard {...meta.args} announcement={pending ? "" : meta.args.announcement}
        pending={pending}
        onDecline={() => setPending({ label: "Declining...", media: null })}
        onAudio={() => setPending({ label: "Connecting...", media: "audio" })}
        onVideo={() => setPending({ label: "Connecting...", media: "video" })} />
      <Button variant="plain" disabledReason={!pending ? "A call is already ringing" : undefined} onClick={() => setPending(null)}>Ring again</Button>
    </div>
  );
}

export const Answering: Story = { render: () => <AnsweringDemo /> };

function IncomingDemo() {
  const [incoming, setIncoming] = useState(false);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <TextField label="Your draft" name="draft" defaultValue="Meet you by the old bridge" />
      <Button tone="secondary" disabledReason={incoming ? "A call is already ringing" : undefined} onClick={() => setIncoming(true)}>Receive a call</Button>
      {incoming && <RingCard {...meta.args} arriving />}
    </div>
  );
}

export const Incoming: Story = {
  render: () => <IncomingDemo />,
  play: async ({ canvasElement }) => {
    flushSync(() => canvasElement.querySelector("button")!.click());
    await Promise.all(canvasElement.querySelector('[data-ouro="ring-card"]')!.getAnimations({ subtree: true }).map((animation) => animation.finished));
  },
};
