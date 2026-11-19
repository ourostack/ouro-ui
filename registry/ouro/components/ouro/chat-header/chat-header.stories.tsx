import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ChatHeader, type ChatMember } from "@/registry/ouro/components/ouro/chat-header/chat-header";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A drawn portrait as a data URL, so stories load no network image. */
function portrait(background: string, skin: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${background}"/>` +
    `<circle cx="32" cy="26" r="12" fill="${skin}"/><path d="M10 64c2-14 11-21 22-21s20 7 22 21z" fill="${skin}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const crew: ChatMember[] = [
  { name: "Ana Lind", src: portrait("#c7d2fe", "#8d5524"), presence: "available", presenceLabel: "Available", note: "Design" },
  { name: "Grace Hopper", presence: "busy", presenceLabel: "In a meeting", note: "Engineering" },
  { name: "Alan Turing", src: portrait("#bbf7d0", "#f1c27d"), presence: "away", presenceLabel: "Away" },
  { name: "Katherine Johnson", note: "Research" },
];

/** A chat's top bar, over a hint of the chat under it. */
function Pane({ children }: { children: ReactNode }) {
  const box: CSSProperties = {
    background: "var(--background)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: "calc(var(--radius) + 4px)",
    maxWidth: 560,
  };
  return (
    <div style={box}>
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>{children}</div>
      <div style={{ padding: 16, color: "var(--muted-foreground)", fontSize: 14 }}>The chat goes here.</div>
    </div>
  );
}

/** A stroked 24px icon, as lucide-react draws them. */
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

const meta = {
  title: "Chat/ChatHeader",
  component: ChatHeader,
  parameters: { layout: "padded" },
  args: { title: "Launch crew", members: crew },
  render: (args) => (
    <Pane>
      <ChatHeader {...args} />
    </Pane>
  ),
} satisfies Meta<typeof ChatHeader>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A group chat: its members' faces, who is in it, and the count that opens the member list. */
export const Group: Story = { parameters: { screenshot: { name: "chat-header-group" } } };

/** A one-to-one chat: the person, their presence dot, and what it says. */
export const OneToOne: Story = {
  parameters: { screenshot: { name: "chat-header-one-to-one" } },
  args: { title: "Ana Lind", members: [crew[0]!] },
};

/** On a phone, with a back button to the list of chats and a call button. */
export const WithBackAndActions: Story = {
  args: {
    title: "Launch crew",
    onBack: () => {},
    actions: (
      <Button variant="plain" tone="secondary" size="sm" aria-label="Call">
        <PhoneIcon />
      </Button>
    ),
  },
};

