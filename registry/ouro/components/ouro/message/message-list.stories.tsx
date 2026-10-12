import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";

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
        <Message key={item.id} role={item.role} name={item.role === "user" ? "Ada Lovelace" : "Ouro"} streaming={item.streaming}>
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
