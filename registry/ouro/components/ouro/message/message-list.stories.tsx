import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Lightbox } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { Message, type MessageAction } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ReactionBar, type Reaction } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";

/** Resolves with what `find` returns once it returns something, checking once a frame (a play function's wait). */
async function frameUntil<T>(find: () => T | null | undefined): Promise<T> {
  for (let frame = 0; frame < 600; frame++) {
    const found = find();
    if (found) return found;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error("the story never reached the state it shows");
}

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

interface Item {
  id: number;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

const questions = ["How long should the dough rest?", "Can I rest it in the fridge?", "And then?", "What oven temperature?", "How do I know it's done?"];
const answers = [
  "About an hour, covered, somewhere warm. It is ready when it has doubled.",
  "Yes. Overnight in the fridge gives more flavor; let it warm up for an hour before shaping.",
  "Shape it, let it rise again for 45 minutes, then score the top.",
  "Preheat to 230°C with a tray of water on the bottom shelf for steam.",
  "The crust is deep brown and the loaf sounds hollow when you tap the bottom.",
];

const start: Item[] = Array.from({ length: 10 }, (_, index) => ({
  id: index,
  role: index % 2 ? "assistant" : "user",
  text: index % 2 ? answers[Math.floor(index / 2) % answers.length]! : questions[Math.floor(index / 2) % questions.length]!,
}));

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        maxWidth: 640,
        display: "grid",
        gap: 12,
        padding: 12,
      }}
    >
      {children}
    </div>
  );
}

function ChatHistory({ items, initialAnchor }: { items: Item[]; initialAnchor?: string }) {
  return (
    <MessageList label="Conversation with Ouro" style={{ height: 420 }} initialAnchor={initialAnchor}>
      {items.map((item) => (
        <Message
          key={item.id}
          id={initialAnchor ? `found-${item.id}` : undefined}
          role={item.role}
          name={item.role === "user" ? "Ana Lind" : "Ouro"}
          presence={item.role === "assistant" ? "available" : undefined}
          presenceLabel="Available"
          streaming={item.streaming}
        >
          {item.text}
        </Message>
      ))}
    </MessageList>
  );
}

const meta = {
  title: "Chat/MessageList",
  component: MessageList,
  parameters: { layout: "padded" },
} satisfies Meta<typeof MessageList>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A conversation that opens at the newest message. Scroll up to see "Jump to latest". */
export const Conversation: Story = {
  args: { label: "Conversation with Ouro", children: null },
  parameters: { screenshot: { name: "message-list" } },
  render: () => (
    <Surface>
      <ChatHistory items={start} />
    </Surface>
  ),
};

/** Replies stream in word by word. Scroll up while one streams: your view stays put. */
function LiveChat() {
  const [items, setItems] = useState(start);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const send = () => {
    clearInterval(timer.current);
    const turn = items.length / 2;
    const reply = answers[Math.floor(turn) % answers.length]!.split(" ");
    const id = items.length;
    setItems((previous) => [
      ...previous.map((item) => ({ ...item, streaming: false })),
      { id, role: "user", text: questions[Math.floor(turn) % questions.length]! },
      { id: id + 1, role: "assistant", text: "", streaming: true },
    ]);
    let words = 0;
    timer.current = setInterval(() => {
      words += 1;
      const done = words >= reply.length;
      if (done) clearInterval(timer.current);
      setItems((previous) => previous.map((item) => (item.id === id + 1 ? { ...item, text: reply.slice(0, words).join(" "), streaming: !done } : item)));
    }, 120);
  };
  return (
    <Surface>
      <ChatHistory items={items} />
      <button
        type="button"
        data-test-harness=""
        onClick={send}
        style={{
          justifySelf: "end",
          font: "inherit",
          padding: "8px 14px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--primary)",
          color: "var(--primary-foreground)",
          cursor: "pointer",
        }}
      >
        Send next question
      </button>
    </Surface>
  );
}

/** Send a question and watch the reply stream in. Screen readers hear each reply once, when it finishes. */
export const Live: Story = {
  args: { label: "Conversation with Ouro", children: null },
  render: () => <LiveChat />,
};

/** A reader who scrolls back through the conversation gets "Jump to latest". The story scrolls to the top. */
export const ScrolledBack: Story = {
  args: { label: "Conversation with Ouro", children: null },
  render: () => (
    <Surface>
      <ChatHistory items={start} />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!.scrollTop = 0;
    await frameUntil(() => canvasElement.querySelector("[data-ouro-message-list-jump]"));
  },
};

const launchPosts = [
  { id: 1, author: "Grace Hopper", text: "The launch checklist is up. Have a look before Thursday." },
  { id: 2, author: "Ana Lind", text: "Read it. The rollback step needs an owner." },
  { id: 3, author: "Grace Hopper", text: "I'll take rollback. Ouro drafts the release notes." },
  { id: 4, author: "Ouro", text: "Release notes drafted from the merged changes." },
  { id: 5, author: "Ana Lind", text: "Thanks! Shipping Thursday at 10." },
  { id: 6, author: "Grace Hopper", text: "Calendar invite sent for the launch call." },
];
const quickReactions = ["👍", "🎉", "❤️"];

/** A channel you can read with the keyboard, with keys of its own for the focused post. */
function KeyboardChannel() {
  const [reactions, setReactions] = useState<Record<string, string>>({});
  return (
    <Surface>
      <MessageList
        label="Launch channel"
        style={{ height: 420 }}
        onMessageKeyDown={(message, event) => {
          const reaction = quickReactions[Number(event.key) - 1];
          if (reaction === undefined) return;
          event.preventDefault();
          setReactions((previous) => ({ ...previous, [message.id]: reaction }));
        }}
      >
        {launchPosts.map((post) => (
          <Message key={post.id} id={`launch-${post.id}`} role="assistant" name={post.author}>
            {post.text}
            {reactions[`launch-${post.id}`] ? ` ${reactions[`launch-${post.id}`]}` : ""}
          </Message>
        ))}
      </MessageList>
    </Surface>
  );
}

/**
 * The messages are one Tab stop. Tab in, then the arrow keys, Home and End move between posts,
 * and 1, 2 or 3 reacts to the focused post.
 */
export const Keyboard: Story = {
  args: { label: "Launch channel", children: null },
  render: () => <KeyboardChannel />,
};

const longChat: Item[] = Array.from({ length: 60 }, (_, index) => ({
  id: index,
  role: index % 3 === 1 ? "user" : "assistant",
  text: index % 3 === 1 ? questions[index % questions.length]! : answers[index % answers.length]!,
}));

/**
 * A long conversation to scroll. The messages trail the scroll a little and catch up on a spring;
 * fling it, or keep scrolling past either end, and they spread apart and settle back. Nothing
 * moves with reduced motion.
 */
export const Springs: Story = {
  args: { label: "Conversation with Ouro", children: null },
  render: () => (
    <Surface>
      <ChatHistory items={longChat} />
    </Surface>
  ),
};

/**
 * A conversation in a wide window, kept to a reading width (`maxWidth={600}`) and centred, so the
 * user's own messages stay near Ouro's. Narrower than that, it fills the list.
 */
export const ReadingWidth: Story = {
  args: { label: "Conversation with Ouro", children: null },
  parameters: { screenshot: { name: "message-list-reading-width" } },
  render: () => (
    <div style={{ background: "var(--background)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "calc(var(--radius) + 4px)" }}>
      <MessageList label="Conversation with Ouro" style={{ height: 420 }} maxWidth={600}>
        {start.slice(0, 6).map((item) => (
          <Message key={item.id} role={item.role} name={item.role === "user" ? "Ana Lind" : "Ouro"}>
            {item.text}
          </Message>
        ))}
      </MessageList>
    </div>
  ),
};

/**
 * Opened at a message found by search, with `initialAnchor`: the list starts with that message in
 * the middle of its view, never showing the newest first, and "Jump to latest" takes the reader to
 * the end, where it follows new messages again.
 */
export const OpenedAtMessage: Story = {
  args: { label: "Conversation with Ouro", children: null },
  render: () => (
    <Surface>
      <ChatHistory items={longChat} initialAnchor="found-20" />
    </Surface>
  ),
};

/** Older messages loading over the top of a conversation scrolled back to its start, in the room `hasOlder` keeps above the first message: no message moves as it shows, and it covers none. */
export const LoadingOlder: Story = {
  args: { label: "Conversation with Ouro", children: null },
  render: () => (
    <Surface>
      <MessageList label="Conversation with Ouro" style={{ height: 420 }} hasOlder loadingOlder>
        {start.map((item) => (
          <Message key={item.id} role={item.role} name={item.role === "user" ? "Ana Lind" : "Ouro"}>
            {item.text}
          </Message>
        ))}
      </MessageList>
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!.scrollTop = 0;
    await frameUntil(() => canvasElement.querySelector("[data-ouro-message-list-jump]"));
  },
};

/** A small picture, drawn inline so the story needs no network: a sky over a hill, in the given hue. */
const picture = (hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="hsl(${hue} 60% 75%)"/><circle cx="92" cy="22" r="10" fill="hsl(${(hue + 40) % 360} 90% 85%)"/><path d="M0 80 50 36l70 44Z" fill="hsl(${(hue + 160) % 360} 35% 40%)"/></svg>`)}`;

const chatPeople = [
  { id: "mara", name: "Mara Quill", hue: 200 },
  { id: "theo", name: "Theo Brandt", hue: 20 },
];

interface ChatItem {
  id: string;
  mine: boolean;
  text: string;
  picture?: number;
  file?: boolean;
  reactions?: Reaction[];
}

/** One long conversation with someone: text, with a picture every 7th message, a file every 11th and reactions every 4th. */
function chatWith(person: (typeof chatPeople)[number], count: number): ChatItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${person.id}-${index}`,
    mine: index % 3 === 1,
    text: index % 3 === 1 ? questions[index % questions.length]! : answers[index % answers.length]!,
    ...(index % 7 === 3 && { picture: person.hue + index }),
    ...(index % 11 === 5 && { file: true }),
    ...(index % 4 === 2 && { reactions: [{ key: "like", label: "Like", emoji: "👍", count: 1 + (index % 3), mine: index % 8 === 2 }] }),
  }));
}

const switchActions: readonly MessageAction[] = [{ key: "like", label: "Like", icon: "👍", onClick: () => {} }];

/** How many messages each conversation holds: 8, or the number in the frame's `?messages=`, for a long one (`?messages=1200`). */
function messagesPerChat(): number {
  return (typeof window === "undefined" ? 0 : Number(new URLSearchParams(window.location.search).get("messages"))) || 8;
}

function SwitchingChats() {
  const [count] = useState(messagesPerChat);
  const chats = useMemo(() => Object.fromEntries(chatPeople.map((person) => [person.id, chatWith(person, count)])), [count]);
  const [open, setOpen] = useState(chatPeople[0]!.id);
  const person = chatPeople.find((each) => each.id === open)!;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 12, maxWidth: 760 }}>
      <div style={{ display: "grid", alignContent: "start", gap: 8 }}>
        {chatPeople.map((each) => (
          <button
            key={each.id}
            type="button"
            data-test-harness=""
            aria-pressed={each.id === open}
            onClick={() => setOpen(each.id)}
            style={{
              font: "inherit",
              padding: "8px 14px",
              textAlign: "start",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: each.id === open ? "var(--accent)" : "var(--background)",
              color: each.id === open ? "var(--accent-foreground)" : "var(--foreground)",
              cursor: "pointer",
            }}
          >
            {each.name}
          </button>
        ))}
      </div>
      <Surface>
        <MessageList key={open} label={`Chat with ${person.name}`} style={{ height: 460 }}>
          {chats[open]!.map((item) => (
            <Message
              key={item.id}
              id={item.id}
              variant="chat"
              role={item.mine ? "user" : "assistant"}
              name={item.mine ? "Priya Okafor" : person.name}
              actions={switchActions}
              attachments={
                item.picture !== undefined ? (
                  <Lightbox label={`Photo from ${person.name}`} layout="mosaic" images={[{ src: picture(item.picture), alt: "A hill under the sky", width: 1200, height: 800 }]} />
                ) : item.file ? (
                  <Attachment name="seating-plan.pdf" size={48_200} contentType="application/pdf" href={`#${item.id}`} />
                ) : undefined
              }
              footer={item.reactions && <ReactionBar reactions={item.reactions} onReact={() => {}} />}
            >
              {item.text}
            </Message>
          ))}
        </MessageList>
      </Surface>
    </div>
  );
}

/**
 * Two conversations to switch between, with pictures, files, reactions and an action bar on each
 * message. Each opens at its newest message in its first frame, drawing the newest first and the
 * rest above them, a few a frame. Add `&messages=1200` to the frame's address for long ones.
 */
export const Switching: Story = {
  args: { label: "Chat", children: null },
  render: () => <SwitchingChats />,
};
