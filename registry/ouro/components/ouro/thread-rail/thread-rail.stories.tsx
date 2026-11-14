import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A conversation beside the thread, in a fixed-height page: the rail takes the page's height. */
function Page({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        height: 520,
        overflow: "hidden",
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, padding: 16, color: "var(--muted-foreground)" }}>Design reviews</div>
      {children}
    </div>
  );
}

const replies = [
  { id: "r1", author: "Ana Lind", text: "The engine notes are attached." },
  { id: "r2", author: "Fen", text: "Shipped the settings page this morning." },
];

/** The thread's contents: the replies, and a composer under them. */
function Thread() {
  return (
    <>
      <MessageList label="Replies" className="min-h-0 flex-1">
        {replies.map((reply) => (
          <Message key={reply.id} role="user" name={reply.author}>
            {reply.text}
          </Message>
        ))}
      </MessageList>
      <Composer label="Reply in thread" onSend={() => {}} />
    </>
  );
}

const meta = {
  title: "Chat/ThreadRail",
  component: ThreadRail,
  parameters: { layout: "padded" },
  args: { label: "Thread", title: "Thread", detail: "Design reviews", meta: "2 replies", onClose: () => {}, children: <Thread /> },
} satisfies Meta<typeof ThreadRail>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Escape, or the close button, calls `onClose`. */
export const Playground: Story = {
  render: (args) => (
    <Page>
      <ThreadRail {...args} className="w-96" />
    </Page>
  ),
};

/** Shows the thread beside the page, and closes it: focus goes back to the button that showed it. */
function ControlledRail() {
  const [open, setOpen] = useState(false);
  return (
    <Page>
      <div style={{ padding: 16 }}>
        <Button variant="outline" aria-expanded={open} onClick={() => setOpen(true)}>
          Show thread
        </Button>
      </div>
      {open && (
        <ThreadRail label="Thread" title="Replies" detail="Design reviews" meta="2 replies" onClose={() => setOpen(false)} className="w-96">
          <Thread />
        </ThreadRail>
      )}
    </Page>
  );
}

export const Controlled: Story = {
  render: () => <ControlledRail />,
};
