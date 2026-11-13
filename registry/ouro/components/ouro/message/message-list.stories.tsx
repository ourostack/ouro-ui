import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Lightbox } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { Message, type MessageAction } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListActions } from "@/registry/ouro/components/ouro/message/message-list";
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

const channelPosts = Array.from({ length: 40 }, (_, index) => launchPosts[index % launchPosts.length]!);

/** Icons for the stories' actions: drawn here, so the story needs no icon library. */
function ReplyIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4 2 8l4 4M2 8h8a4 4 0 0 1 4 4" />
    </svg>
  );
}
function ReactIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="8" r="5.5" />
      <path d="M5 9.5c.5.8 1.2 1.2 2 1.2s1.5-.4 2-1.2M5.2 6.5h.01M8.8 6.5h.01M13 2v3M11.5 3.5h3" />
    </svg>
  );
}

/** A busy channel whose every post has the same actions: the list draws one bar and one menu for all of them. */
function ActionsChannel() {
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [said, setSaid] = useState("");
  const react = (id: string, emoji: string) => () => setReactions((previous) => ({ ...previous, [id]: emoji }));
  return (
    <Surface>
      <MessageList label="Launch channel" style={{ height: 420 }}>
        {channelPosts.map((post, index) => {
          const id = `post-${index}`;
          return (
            <Message
              key={id}
              id={id}
              variant="chat"
              role={post.author === "Ana Lind" ? "user" : "assistant"}
              name={post.author}
              time={`9:${String(10 + (index % 50)).padStart(2, "0")} AM`}
              footer={reactions[id] ? <span aria-label={`You reacted ${reactions[id]}`}>{reactions[id]}</span> : undefined}
              actions={[
                { key: "like", label: "Like", icon: "👍", onClick: react(id, "👍"), shortcut: ["1"] },
                { key: "react", label: "More reactions", icon: <ReactIcon />, onClick: () => setSaid(`Pick a reaction for post ${index + 1}`) },
                { key: "reply", label: "Reply", icon: <ReplyIcon />, onClick: () => setSaid(`Replying to ${post.author}`) },
              ]}
              quickReactions={[
                { key: "like", label: "Like", icon: "👍", onClick: react(id, "👍"), shortcut: ["1"] },
                { key: "heart", label: "Heart", icon: "❤️", onClick: react(id, "❤️"), shortcut: ["2"] },
                { key: "laugh", label: "Laugh", icon: "😄", onClick: react(id, "😄"), shortcut: ["3"] },
                { key: "party", label: "Party", icon: "🎉", onClick: react(id, "🎉"), shortcut: ["4"] },
                { key: "more", label: "More reactions", icon: <ReactIcon />, onClick: () => setSaid(`Pick a reaction for post ${index + 1}`) },
              ]}
              menu={[
                { label: "Reply", icon: <ReplyIcon />, shortcut: ["r"], onClick: () => setSaid(`Replying to ${post.author}`) },
                { label: "Copy link", shortcut: ["mod", "shift", "c"], onClick: () => setSaid("Link copied") },
                { label: "Mark unread", shortcut: ["u"], onClick: () => setSaid("Marked unread") },
                { type: "separator" },
                { label: "Delete", tone: "destructive", onClick: () => setSaid("Deleted") },
              ]}
            >
              {post.text}
            </Message>
          );
        })}
      </MessageList>
      <p role="status" style={{ margin: 0, minHeight: "1.5em", fontSize: 14 }}>
        {said}
      </p>
    </Surface>
  );
}

const harnessStyle = {
  font: "inherit",
  padding: "8px 14px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
} as const;

/** Two thousand messages, the newest quoting the first question. */
const history: Item[] = Array.from({ length: 2000 }, (_, index) => ({
  id: index,
  role: index % 2 ? "assistant" : "user",
  text: index === 1999 ? "Yes, as I said at the start: about an hour." : `${index % 2 ? answers[index % answers.length]! : questions[index % questions.length]!} (${index + 1})`,
}));

function LongChat() {
  const actions = useRef<MessageListActions>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<string | null>(null);
  // Find in chat: the page holds only the messages drawn, so search the messages themselves, newest first, then reveal.
  const find = (event: { preventDefault(): void }) => {
    event.preventDefault();
    const match = history.findLast((item) => query !== "" && item.text.toLowerCase().includes(query.toLowerCase()));
    setFound(match ? `Showing message ${match.id + 1}` : "No message has that");
    if (match) actions.current?.reveal(`long-${match.id}`, { focus: true });
  };
  return (
    <Surface>
      <form role="search" onSubmit={find} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input data-test-harness="" aria-label="Find in chat" value={query} onChange={(event) => setQuery(event.target.value)} style={{ ...harnessStyle, flex: 1 }} />
        <button type="submit" data-test-harness="" style={harnessStyle}>
          Find
        </button>
        <span role="status" style={{ color: "var(--muted-foreground)" }}>
          {found}
        </span>
      </form>
      <MessageList label="Conversation with Ouro" style={{ height: 420 }} actionsRef={actions}>
        {history.map((item) => (
          <Message
            key={item.id}
            id={`long-${item.id}`}
            role={item.role}
            name={item.role === "user" ? "Ana Lind" : "Ouro"}
            quote={item.id === 1999 ? { author: "Ana Lind", excerpt: history[0]!.text, onActivate: () => actions.current?.reveal("long-0", { focus: true }) } : undefined}
          >
            {item.text}
          </Message>
        ))}
      </MessageList>
    </Surface>
  );
}

const OLDER_PAGE = 200;
const OLDER_TOTAL = 1000;

/** A channel that reads a page of older posts, 800 ms late, whenever the reader is within two screens of its top. */
function OlderChat() {
  const [count, setCount] = useState(100);
  const [loading, setLoading] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const first = OLDER_TOTAL - count;
  useEffect(() => {
    const scroller = wrap.current!.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    if (loading || count >= OLDER_TOTAL) return;
    const near = () => scroller.scrollTop < scroller.clientHeight * 2 && scroller.scrollHeight > scroller.clientHeight;
    const ask = () => {
      if (!near()) return;
      scroller.removeEventListener("scroll", ask);
      setLoading(true);
      setTimeout(() => {
        setCount((now) => now + OLDER_PAGE);
        setLoading(false);
      }, 800);
    };
    scroller.addEventListener("scroll", ask, { passive: true });
    return () => scroller.removeEventListener("scroll", ask);
  }, [count, loading]);
  return (
    <Surface>
      <div ref={wrap} data-count={count}>
        <MessageList label="Older history" style={{ height: 420 }} hasOlder={count < OLDER_TOTAL} loadingOlder={loading}>
          {Array.from({ length: count }, (_, at) => {
            const id = first + at;
            return (
              <Message key={id} id={`older-${id}`} variant="chat" role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana Lind"}>
                {`${id % 2 ? answers[id % answers.length]! : questions[id % questions.length]!} (${id + 1})`}
              </Message>
            );
          })}
        </MessageList>
      </div>
    </Surface>
  );
}

/**
 * A channel of 1,000 posts that holds its newest 100 and reads 200 older ones, 800 ms late, whenever the reader
 * comes within two screens of the top: the reader's place holds while each page goes in above.
 */
export const OlderHistory: Story = {
  args: { label: "Older history", children: null },
  render: () => <OlderChat />,
};

const DRAWN_PAGE = 144;

/**
 * A channel that draws its own messages, all in one child, and reads a page of older ones, 800 ms late, whenever the reader is
 * within two screens of the top: the page then goes in above them a message a frame, as an app that keeps each frame short does.
 */
function DrawnOlderChat() {
  // How many of the channel's newest messages the app has, and how many of those it has drawn.
  const [count, setCount] = useState(30);
  const [drawn, setDrawn] = useState(30);
  const [loading, setLoading] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (drawn >= count) return;
    const frame = requestAnimationFrame(() => setDrawn((now) => Math.min(count, now + 1)));
    return () => cancelAnimationFrame(frame);
  }, [count, drawn]);
  useEffect(() => {
    const scroller = wrap.current!.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    if (loading || drawn < count || count >= OLDER_TOTAL) return;
    const near = () => scroller.scrollTop < scroller.clientHeight * 2 && scroller.scrollHeight > scroller.clientHeight;
    const ask = () => {
      if (!near()) return;
      scroller.removeEventListener("scroll", ask);
      setLoading(true);
      setTimeout(() => {
        setCount((now) => Math.min(OLDER_TOTAL, now + DRAWN_PAGE));
        setLoading(false);
      }, 800);
    };
    scroller.addEventListener("scroll", ask, { passive: true });
    return () => scroller.removeEventListener("scroll", ask);
  }, [count, drawn, loading]);
  const first = OLDER_TOTAL - drawn;
  return (
    <Surface>
      <div ref={wrap} data-count={drawn}>
        <MessageList label="Older history drawn" style={{ height: 600 }} hasOlder={count < OLDER_TOTAL} loadingOlder={loading}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Array.from({ length: drawn }, (_, at) => {
              const id = first + at;
              return (
                <Message key={id} id={`drawn-${id}`} variant="post" role="assistant" name={id % 2 ? "Ouro" : "Ana Lind"}>
                  {`${answers[id % answers.length]!} ${answers[(id + 2) % answers.length]!} ${answers[(id + 4) % answers.length]!} (${id + 1})`}
                  {id % 2 === 0 ? <div aria-hidden style={{ height: 160, marginTop: 8, borderRadius: 8, background: "var(--muted)" }} /> : null}
                </Message>
              );
            })}
          </div>
        </MessageList>
      </div>
    </Surface>
  );
}

/**
 * A channel of 1,000 posts drawn by the app in one child, holding its newest 30, that reads 144 older ones, 800 ms late,
 * whenever the reader comes within two screens of the top, and draws them in above a message a frame while the reader
 * scrolls on: the wheel keeps moving the messages, and what went in above stays in reach.
 */
export const OlderHistoryDrawn: Story = {
  args: { label: "Older history drawn", children: null },
  render: () => <DrawnOlderChat />,
};

/** Shows the list's one bar on the newest post, as the pointer over it would. */
async function hoverNewest(canvasElement: HTMLElement) {
  const newest = await frameUntil(() => canvasElement.querySelector<HTMLElement>("#post-39"));
  return frameUntil(() => {
    newest.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    return newest.querySelector<HTMLElement>('[data-ouro-part="menu"]');
  });
}

/**
 * Every post has actions, and the list draws one bar for all of them: on the post the pointer is
 * over, or the one keyboard focus is in. It goes as the pointer leaves, so none stays behind.
 * Right-click a post, press its "…" button, or Shift+F10 on a focused post: one menu, with quick
 * reactions on top, each with its key under it, and each action's keys at its end.
 */
export const Actions: Story = {
  args: { label: "Launch channel", children: null },
  parameters: { screenshot: { name: "message-list-actions" } },
  render: () => <ActionsChannel />,
  play: async ({ canvasElement }) => {
    await hoverNewest(canvasElement);
  },
};

/** The list's one menu for a post, open from its "…" button: quick reactions on top, then the actions with their keys. */
export const ActionsMenu: Story = {
  args: { label: "Launch channel", children: null },
  parameters: { screenshot: { name: "message-list-menu" } },
  render: () => <ActionsChannel />,
  play: async ({ canvasElement }) => {
    (await hoverNewest(canvasElement)).click();
    await frameUntil(() => document.querySelector('[data-ouro="menu"][data-open]'));
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
        <MessageList key={open} label={`Chat with ${person.name}`} style={{ height: 460, minWidth: 0 }}>
          {chats[open]!.map((item, at, all) => (
            <Message
              key={item.id}
              id={item.id}
              variant="chat"
              role={item.mine ? "user" : "assistant"}
              name={item.mine ? "Priya Okafor" : person.name}
              actions={at === all.length - 1 ? switchActions : undefined}
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
 * A conversation of 2,000 messages: only those near the view are drawn, so it opens and scrolls as a short one does.
 * Press the newest message's quote to go to the first question, or find a message by its words: the page holds only
 * the messages drawn, so the search reads the messages themselves and reveals the match with `actionsRef`.
 */
export const LongConversation: Story = {
  args: { label: "Conversation with Ouro", children: null },
  render: () => <LongChat />,
};

/**
 * Two conversations to switch between, with pictures, files, reactions and an action bar on the
 * newest message. Each opens at its newest message in its first frame. Add `&messages=1200` to the frame's address for long ones.
 */
export const Switching: Story = {
  args: { label: "Chat", children: null },
  render: () => <SwitchingChats />,
};
