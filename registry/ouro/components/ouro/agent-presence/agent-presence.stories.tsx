import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { AgentPresence, type AgentPresenceProps, type ListeningAgent } from "@/registry/ouro/components/ouro/agent-presence/agent-presence";
import { Button } from "@/registry/ouro/components/ouro/button/button";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).
// The agents are made up and named by their role.

const inbox: ListeningAgent = { id: "inbox", name: "inbox agent", doing: "listening for your name, and anything about the empty state" };
const research: ListeningAgent = { id: "research", name: "research agent", doing: "noting every question about pricing" };

/** A meeting's title bar, with the chip where the person always sees it. */
function TitleBar({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        maxWidth: 520,
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>Design review</span>
      {children}
    </div>
  );
}

/** The chip with agents the person can stop, and a button that asks them to listen again. */
function Listening({ initial, ...props }: { initial: ListeningAgent[] } & Partial<AgentPresenceProps>) {
  const [agents, setAgents] = useState(initial);
  return (
    <div style={{ display: "grid", gap: 16, justifyItems: "start" }}>
      <TitleBar>
        <AgentPresence
          label="Agents listening"
          {...props}
          agents={agents}
          onStop={(id) => setAgents((now) => now.filter((agent) => agent.id !== id))}
          onStopAll={() => setAgents([])}
        />
      </TitleBar>
      <Button size="sm" variant="outline" tone="secondary" onClick={() => setAgents(initial.length > 0 ? initial : [inbox])}>
        Ask them to listen again
      </Button>
    </div>
  );
}

const meta = {
  title: "Feedback/AgentPresence",
  component: AgentPresence,
  parameters: { layout: "padded" },
  args: { label: "Agents listening", agents: [inbox], onStop: () => {} },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof AgentPresence>;
export default meta;

type Story = StoryObj<typeof meta>;

/** One agent listening: the chip names it. Press it to see what the agent listens for, and Stop. */
export const OneAgent: Story = {
  render: (args) => <Listening initial={[inbox]} size={args.size} />,
};

/** Two agents: the chip counts them, and the popover lists each with its Stop, plus Stop all. */
export const TwoAgents: Story = {
  parameters: { screenshot: { name: "agent-presence-open", open: true } },
  render: () => <Listening initial={[inbox, research]} />,
};

/** `compact`: the sparkle and a count, for a tight bar or a floating mini-window. Its name still says who. */
export const Compact: Story = {
  render: () => <Listening initial={[inbox, research]} compact />,
};

/** `unread`: a dot says an agent left something for the person. The chip opens nothing by itself. */
export const Unread: Story = {
  parameters: { screenshot: { name: "agent-presence-unread" } },
  render: () => (
    <div style={{ display: "grid", gap: 16, justifyItems: "start" }}>
      <Listening initial={[inbox]} unread />
      <Listening initial={[inbox, research]} unread compact />
    </div>
  ),
};

/** No agent listening: AgentPresence renders nothing. Ask the inbox agent to listen to bring the chip back. */
export const Empty: Story = {
  render: () => <Listening initial={[]} />,
};
