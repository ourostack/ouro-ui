import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { EventChip } from "@/registry/ouro/components/ouro/event-chip/event-chip";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, maxWidth: 560 }}>{children}</div>;
}

function Opening() {
  const [opened, setOpened] = useState("Nothing opened yet");
  return (
    <Surface>
      <EventChip label="Next meeting" when="in 12 min" title="Weekly sync" state="soon" status="Needs you" statusTone="warning" onClick={() => setOpened("Opened Weekly sync")} />
      <span style={{ fontSize: 14 }}>{opened}</span>
    </Surface>
  );
}

const meta = {
  title: "Display/EventChip",
  component: EventChip,
  parameters: { layout: "padded" },
  args: { title: "Weekly sync", when: "in 12 min", status: "Ready", statusTone: "success" },
  argTypes: {
    state: { control: "inline-radio", options: ["upcoming", "soon", "now"] },
    statusTone: { control: "inline-radio", options: ["primary", "secondary", "destructive", "success", "warning"] },
  },
} satisfies Meta<typeof EventChip>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <EventChip {...args} onClick={() => {}} />
    </Surface>
  ),
};

/** How near it is: upcoming, starting soon, and happening now. */
export const States: Story = {
  render: () => (
    <Surface>
      <EventChip when="Tomorrow 9:00" title="Design review" status="Ready" statusTone="success" onClick={() => {}} />
      <EventChip when="in 12 min" title="Weekly sync" state="soon" status="Needs you" statusTone="warning" onClick={() => {}} />
      <EventChip when="Now" title="Customer call" state="now" href="#customer-call" />
    </Surface>
  ),
};

/** A click opens what the chip leads to. */
export const Open: Story = {
  render: () => <Opening />,
};
