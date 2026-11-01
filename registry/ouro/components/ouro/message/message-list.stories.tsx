import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";

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

function ChatHistory({ items }: { items: Item[] }) {
  return (
    <MessageList label="Conversation with Ouro" style={{ height: 420 }}>
      {items.map((item) => (
        <Message
          key={item.id}
          role={item.role}
          name={item.role === "user" ? "Ada Lovelace" : "Ouro"}
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
  { id: 2, author: "Ada Lovelace", text: "Read it. The rollback step needs an owner." },
  { id: 3, author: "Grace Hopper", text: "I'll take rollback. Ouro drafts the release notes." },
  { id: 4, author: "Ouro", text: "Release notes drafted from the merged changes." },
  { id: 5, author: "Ada Lovelace", text: "Thanks! Shipping Thursday at 10." },
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
