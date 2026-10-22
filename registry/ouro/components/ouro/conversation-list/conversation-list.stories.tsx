import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { ConversationList, type ConversationListItem } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 8,
        maxWidth: 380,
      }}
    >
      {children}
    </div>
  );
}

const conversations: ConversationListItem[] = [
  { id: "trail", title: "Trail crew", subtitle: "Weekend hikes", preview: "Meet at the north gate at eight.", time: "9:41", unread: true },
  { id: "ada", title: "Ada Lovelace", preview: "The engine notes are attached.", time: "8:15" },
  { id: "garden", title: "Garden club", preview: "Seed swap moved to Sunday.", time: "Tue", badges: <Badge variant="soft">Muted</Badge> },
  { id: "grace", title: "Grace Hopper", preview: "Found the bug: a moth in relay 70.", time: "Mon", unread: true },
];

function Controlled({ density }: { density?: "comfortable" | "compact" }) {
  const [openId, setOpenId] = useState<string | null>("ada");
  return (
    <Surface>
      <ConversationList label="Conversations" items={conversations} selectedId={openId} onSelect={setOpenId} density={density} />
    </Surface>
  );
}

const meta = {
  title: "Chat/ConversationList",
  component: ConversationList,
  parameters: { layout: "padded" },
  args: { label: "Conversations", items: conversations, selectedId: "ada", onSelect: () => {} },
  argTypes: {
    density: { control: "inline-radio", options: ["comfortable", "compact"] },
  },
} satisfies Meta<typeof ConversationList>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <ConversationList {...args} />
    </Surface>
  ),
};

/** Choose a conversation by click, tap, or the arrow keys and Enter: its row stays highlighted. */
export const Selectable: Story = {
  render: () => <Controlled />,
};

/** `density="compact"` drops the preview line for a narrow sidebar. */
export const Compact: Story = {
  render: () => <Controlled density="compact" />,
};

/** With no conversations, the `empty` message shows. */
export const Empty: Story = {
  render: () => (
    <Surface>
      <ConversationList label="Conversations" items={[]} empty="Start a conversation to see it here." onSelect={() => {}} />
    </Surface>
  ),
};
