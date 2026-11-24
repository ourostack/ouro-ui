import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ThreadLayout } from "@/registry/ouro/components/ouro/thread-layout/thread-layout";
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A page of fixed height, as an app gives the layout: the layout takes the page's height. */
function Page({ width, children }: { width?: number; children: ReactNode }) {
  return (
    <div
      style={{
        width: width ?? "100%",
        height: 520,
        overflow: "hidden",
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
      }}
    >
      {children}
    </div>
  );
}

const messages = [
  { id: "m1", author: "Ana Lind", text: "Notes for the engine are attached." },
  { id: "m2", author: "Fen", text: "Shipped the settings page this morning." },
  { id: "m3", author: "Ola", text: "Which room for the Thursday review?" },
];

const replies = [
  { id: "r1", author: "Ana Lind", text: "The engine notes are attached." },
  { id: "r2", author: "Fen", text: "Thanks, I'll read them tonight." },
];

/** The conversation: the channel's messages, and the reply box under them. */
function Conversation() {
  return (
    <>
      <MessageList label="Messages" className="min-h-0 flex-1">
        {messages.map((message) => (
          <Message key={message.id} role="user" name={message.author}>
            {message.text}
          </Message>
        ))}
      </MessageList>
      {/* With a thread open, the conversation pane sits flush against the rail's own border-s: an unwrapped
          Composer's own end border would land on that same line, so this gives it the same inset the rail's
          composer gets. */}
      <div className="border-t border-border p-2">
        <Composer label="Message the channel" onSend={() => {}} />
      </div>
    </>
  );
}

/** The thread's contents: the replies, and a composer under them. */
function Replies() {
  return (
    <>
      <MessageList label="Replies" className="min-h-0 flex-1">
        {replies.map((reply) => (
          <Message key={reply.id} role="user" name={reply.author}>
            {reply.text}
          </Message>
        ))}
      </MessageList>
      <div className="border-t border-border p-2">
        <Composer label="Reply in thread" onSend={() => {}} />
      </div>
    </>
  );
}

function OpenThread({ onClose }: { onClose: () => void }) {
  return (
    <ThreadRail label="Thread" title="Replies" detail="Design reviews" meta="2 replies" onClose={onClose}>
      <Replies />
    </ThreadRail>
  );
}

const meta = {
  title: "Chat/ThreadLayout",
  component: ThreadLayout,
  parameters: { layout: "padded" },
  args: { conversation: <Conversation />, thread: null },
} satisfies Meta<typeof ThreadLayout>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The thread beside the conversation, from 32rem up: the rail takes 20rem and the conversation the rest. */
export const Default: Story = {
  render: () => (
    <Page>
      <ThreadLayout conversation={<Conversation />} thread={<OpenThread onClose={() => {}} />} />
    </Page>
  ),
};

/** In a 360px box the open thread takes the whole box, and the conversation waits hidden. */
export const Narrow: Story = {
  render: () => (
    <Page width={360}>
      <ThreadLayout conversation={<Conversation />} thread={<OpenThread onClose={() => {}} />} />
    </Page>
  ),
};

/** Shows the thread from the conversation's button, and closes it again: with no thread, the conversation takes the whole box. */
function ClosedThread() {
  const [open, setOpen] = useState(false);
  return (
    <Page>
      <ThreadLayout
        conversation={
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <p style={{ margin: 0, color: "var(--muted-foreground)" }}>Design reviews</p>
            <Button variant="outline" aria-expanded={open} onClick={() => setOpen(true)}>
              Show thread
            </Button>
          </div>
        }
        thread={open ? <OpenThread onClose={() => setOpen(false)} /> : null}
      />
    </Page>
  );
}

export const Closed: Story = {
  render: () => <ClosedThread />,
};
