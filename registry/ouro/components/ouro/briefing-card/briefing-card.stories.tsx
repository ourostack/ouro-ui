import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { AgentNote } from "@/registry/ouro/components/ouro/agent-note/agent-note";
import { BriefingCard, type BriefingCardItem } from "@/registry/ouro/components/ouro/briefing-card/briefing-card";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Link } from "@/registry/ouro/components/ouro/link/link";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16, display: "grid", gap: 12, maxWidth: 480 }}>{children}</div>;
}

const items: BriefingCardItem[] = [
  { id: "chat", label: "Chat", content: "2 new · 1 asks you" },
  { id: "last", label: "Last time", content: <Link href="#notes">Notes from last week</Link> },
  { id: "waiting", label: "Waiting on you", content: "The rollout numbers" },
  { id: "drafts", label: "Drafts", content: null },
];

const meta = {
  title: "Display/BriefingCard",
  component: BriefingCard,
  parameters: { layout: "padded" },
  args: { title: "Weekly sync", detail: "In 25 min · 6 people", status: "Needs you", statusTone: "warning", items },
  argTypes: {
    statusTone: { control: "inline-radio", options: ["primary", "secondary", "destructive", "success", "warning"] },
  },
} satisfies Meta<typeof BriefingCard>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <BriefingCard {...args} />
    </Surface>
  ),
};

/** A briefing with its rows, an agent's note and the actions. Empty rows are left out. */
export const WithNote: Story = {
  render: () => (
    <Surface>
      <BriefingCard
        title="Weekly sync"
        detail="In 25 min · 6 people"
        status="Needs you"
        statusTone="warning"
        items={items}
        note={<AgentNote text="Sam asks for the rollout numbers before the review." author="agent" name="Ouro" time="5 min ago" source="Based on 3 messages" onPin={() => {}} onDismiss={() => {}} />}
        actions={
          <>
            <Button size="sm">Open chat</Button>
            <Button size="sm" variant="plain">
              Notes
            </Button>
          </>
        }
      />
    </Surface>
  ),
};
