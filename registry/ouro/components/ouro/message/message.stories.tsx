import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { Message, type MessageAction } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ThreadSummary } from "@/registry/ouro/components/ouro/message/thread-summary";
import { ReactionBar, type Reaction, type ReactionOption } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";

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
        padding: 16,
        display: "grid",
        gap: 16,
        maxWidth: 640,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Chat/Message",
  component: Message,
  parameters: { layout: "padded" },
  args: { role: "assistant", name: "Ouro", children: "Rest the dough for an hour, covered, somewhere warm." },
  argTypes: {
    role: { control: "inline-radio", options: ["user", "assistant", "system"] },
  },
} satisfies Meta<typeof Message>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <Message {...args} />
    </Surface>
  ),
};

/** The three roles: the app's note centered, the user's message at the end, the assistant's at the start. */
export const Roles: Story = {
  parameters: { screenshot: { name: "message-roles" } },
  render: () => (
    <Surface>
      <Message role="system" name="Ouro">
        Ada started a conversation
      </Message>
      <Message role="user" name="Ada Lovelace">
        How long should the dough rest?
      </Message>
      <Message role="assistant" name="Ouro">
        About an hour, covered, somewhere warm. It is ready when it has doubled and springs back slowly when you press it.
      </Message>
    </Surface>
  ),
};

/** A reply still being written: the typing indicator, then partial text. */
export const Streaming: Story = {
  render: () => (
    <Surface>
      <Message role="assistant" name="Ouro" streaming />
      <Message role="assistant" name="Ouro" streaming>
        About an hour, covered
      </Message>
    </Surface>
  ),
};

/** Files sent with a message, under the bubble. */
export const WithAttachments: Story = {
  render: () => (
    <Surface>
      <Message
        role="user"
        name="Ada Lovelace"
        attachments={
          <>
            <Attachment name="crumb.jpg" size={348_160} contentType="image/jpeg" href="#crumb" />
            <Attachment name="recipe.pdf" size={2048} href="#recipe" />
          </>
        }
      >
        Here is my crumb. Too dense?
      </Message>
    </Surface>
  ),
};

/** Stroke icons for the stories' actions, drawn here so the stories need no icon package. */
function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const quick: ReactionOption[] = [
  { key: "like", label: "Like", emoji: "👍" },
  { key: "heart", label: "Heart", emoji: "❤️" },
  { key: "laugh", label: "Laugh", emoji: "😄" },
];

function toggle(list: Reaction[], key: string): Reaction[] {
  const found = list.find((reaction) => reaction.key === key);
  if (!found) return [...list, { ...quick.find((option) => option.key === key)!, count: 1, mine: true }];
  return list
    .map((reaction) => (reaction.key === key ? { ...reaction, count: reaction.count + (reaction.mine ? -1 : 1), mine: !reaction.mine } : reaction))
    .filter((reaction) => reaction.count > 0);
}

/** The actions every story message offers: a quick Like, Reply, and a menu with the rest. */
function actionsFor(react: (key: string) => void, reply: () => void): readonly MessageAction[] {
  return [
    { key: "like", label: "Like", icon: "👍", onClick: () => react("like") },
    { key: "reply", label: "Reply", icon: <Icon d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />, onClick: reply },
  ];
}

const menu = [
  { label: "Copy text", icon: <Icon d="M8 8h11v11H8zM5 16V5h11" />, onClick: () => {} },
  { label: "Copy link", icon: <Icon d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />, onClick: () => {} },
  { type: "separator" as const },
  { label: "Edit", disabled: true },
  { label: "Delete", tone: "destructive" as const, disabled: true },
];

function ChatConversation() {
  const [reactions, setReactions] = useState<Reaction[]>([{ key: "heart", label: "Heart", emoji: "❤️", count: 2 }]);
  const [replying, setReplying] = useState("");
  const react = (key: string) => setReactions((current) => toggle(current, key));
  const actions = actionsFor(react, () => setReplying("Replying to Mara Quill"));
  return (
    <Surface>
      <MessageList label="Chat with Mara Quill and Theo Brandt" style={{ height: 460 }}>
        <Message variant="chat" role="assistant" name="Mara Quill" presence="available" presenceLabel="Available" time="9:41 AM" dateTime="2026-05-04T09:41" actions={actions} menu={menu}>
          Morning! The venue confirmed the long table for Friday.
        </Message>
        <Message variant="chat" role="assistant" name="Mara Quill" time="9:41 AM" dateTime="2026-05-04T09:41" continued actions={actions} menu={menu}>
          Can someone bring the extension cord for the projector?
        </Message>
        <Message
          variant="chat"
          role="assistant"
          name="Theo Brandt"
          avatar={<Avatar name="Theo Brandt" alt="" size="sm" presence="away" presenceLabel="Away" />}
          time="9:43 AM"
          dateTime="2026-05-04T09:43"
          actions={actions}
          menu={menu}
          footer={<ReactionBar reactions={reactions} quick={quick} onReact={react} />}
        >
          I have one. I will bring it with the speakers.
        </Message>
        <Message variant="chat" role="user" name="Priya Okafor" time="9:45 AM" dateTime="2026-05-04T09:45" actions={actions} menu={menu}>
          Perfect, thank you both.
        </Message>
        <Message
          variant="chat"
          role="user"
          name="Priya Okafor"
          time="9:45 AM"
          dateTime="2026-05-04T09:45"
          continued
          actions={actions}
          menu={menu}
          footer={<span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Edited · Seen</span>}
        >
          I will print the seating plan tonight.
        </Message>
      </MessageList>
      <p role="status" style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
        {replying}
      </p>
    </Surface>
  );
}

/**
 * People writing to each other (`variant="chat"`): others at the start on a raised bubble under
 * their name and time, with their presence on the avatar, the user's own at the end in a tint,
 * runs from one author grouped with `continued`. Hover a message, or Tab to it, for its action bar.
 */
export const Chat: Story = {
  render: () => <ChatConversation />,
};

function ChannelPosts() {
  const [reactions, setReactions] = useState<Reaction[]>([{ key: "like", label: "Like", emoji: "👍", count: 4, mine: true }]);
  const [opened, setOpened] = useState("");
  const react = (key: string) => setReactions((current) => toggle(current, key));
  const actions = actionsFor(react, () => setOpened("Replying to Jonah Vale"));
  return (
    <Surface>
      <Message
        variant="post"
        role="assistant"
        name="Jonah Vale"
        presence="busy"
        presenceLabel="In a meeting"
        time="7:30 AM"
        dateTime="2026-05-04T07:30"
        subject="Agenda for Friday's design review"
        actions={actions}
        menu={menu}
        footer={<ReactionBar reactions={reactions} quick={quick} onReact={react} />}
        thread={
          <ThreadSummary
            count={3}
            repliers={[{ name: "Mara Quill" }, { name: "Theo Brandt" }, { name: "Priya Okafor" }]}
            lastReply="7:44 AM"
            lastReplyDateTime="2026-05-04T07:44"
            onOpen={() => setOpened("Opened the thread: Agenda for Friday's design review")}
          />
        }
      >
        We will look at the new onboarding flow first, then the settings page. Add your questions to this thread before Thursday so we can group them.
      </Message>
      <Message
        variant="post"
        role="user"
        name="Priya Okafor"
        time="8:02 AM"
        dateTime="2026-05-04T08:02"
        actions={actions}
        menu={menu}
        thread={<ThreadSummary count={0} onOpen={() => setOpened("Started a thread under Priya Okafor's post")} />}
      >
        The mockups are in the Files tab.
      </Message>
      <p role="status" style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
        {opened}
      </p>
    </Surface>
  );
}

/**
 * Posts in a channel (`variant="post"`): a card as wide as the list under the author's name and
 * time, with a subject, reactions inside the card, and the thread's summary under it.
 */
export const Posts: Story = {
  render: () => <ChannelPosts />,
};

/** A post's thread: the post, then its replies (`variant="reply"`), unboxed, with runs grouped. */
export const Thread: Story = {
  render: () => (
    <Surface>
      <Message variant="post" role="assistant" name="Jonah Vale" time="7:30 AM" subject="Agenda for Friday's design review">
        We will look at the new onboarding flow first, then the settings page.
      </Message>
      <Message variant="reply" role="assistant" name="Mara Quill" presence="available" presenceLabel="Available" time="7:36 AM">
        Can we start with the settings page? Theo is out after lunch.
      </Message>
      <Message variant="reply" role="assistant" name="Mara Quill" time="7:36 AM" continued>
        Either way works for me.
      </Message>
      <Message variant="reply" role="user" name="Priya Okafor" time="7:44 AM">
        Swapped. Settings page first.
      </Message>
    </Surface>
  ),
};
