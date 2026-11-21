import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type JSX } from "react";
import { ConversationFind } from "@/registry/ouro/components/ouro/conversation-find/conversation-find";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListFindReport } from "@/registry/ouro/components/ouro/message/message-list";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const lines = ["Lunch at noon?", "Nothing to add.", "Café for lunch, or LUNCH out", "Straße ahead", "Back for lunch at one"];

/** A conversation under its find bar, wired the way an app does: the list reports, the bar steps. */
function FindableChat(): JSX.Element {
  const [query, setQuery] = useState("lunch");
  const [current, setCurrent] = useState<number | null>(0);
  const [report, setReport] = useState<MessageListFindReport>({ count: 0, current: null, partial: false });
  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 480, background: "var(--background)", color: "var(--foreground)", border: "1px solid var(--border)", padding: 8 }}>
      <ConversationFind
        label="Find in conversation"
        query={query}
        onQueryChange={(next) => {
          setQuery(next);
          setCurrent(0);
        }}
        count={report.count}
        current={report.current}
        partial={report.partial}
        onCurrentChange={setCurrent}
        onClose={() => setQuery("")}
      />
      <MessageList label="Chat" style={{ height: 240 }} find={{ query, current: current ?? 0 }} onFindMatches={setReport}>
        {lines.map((text, index) => (
          <Message key={index} id={`m${index}`} variant="chat" role={index % 2 ? "user" : "assistant"} name={index % 2 ? "You" : "Ana"}>
            {text}
          </Message>
        ))}
      </MessageList>
    </div>
  );
}

const meta = {
  title: "Chat/ConversationFind",
  component: ConversationFind,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ConversationFind>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The bar over a conversation: three of the five messages hold "lunch". */
export const WithMessageList: Story = {
  args: { label: "Find in conversation", query: "lunch", onQueryChange: () => {}, count: 3, current: 0, onCurrentChange: () => {}, onClose: () => {} },
  render: () => <FindableChat />,
};

/** A search with no match says so, and its step buttons stay in the tab order but do nothing. */
export const NoMatches: Story = {
  args: { label: "Find in conversation", query: "zebra", onQueryChange: () => {}, count: 0, current: null, onCurrentChange: () => {}, onClose: () => {} },
  render: (args) => (
    <div style={{ maxWidth: 480, background: "var(--background)", color: "var(--foreground)", border: "1px solid var(--border)", padding: 8 }}>
      <ConversationFind {...args} />
    </div>
  ),
};
