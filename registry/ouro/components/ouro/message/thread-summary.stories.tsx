import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { ThreadSummary } from "@/registry/ouro/components/ouro/message/thread-summary";

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

const repliers = [{ name: "Mara Quill" }, { name: "Theo Brandt" }, { name: "Priya Okafor" }, { name: "Jonah Vale" }];

const meta = {
  title: "Chat/ThreadSummary",
  component: ThreadSummary,
  parameters: { layout: "padded" },
  args: { count: 4, repliers, lastReply: "7:44 AM", onOpen: () => {} },
} satisfies Meta<typeof ThreadSummary>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <ThreadSummary {...args} />
    </Surface>
  ),
};

function Posts() {
  const [opened, setOpened] = useState("");
  return (
    <Surface>
      <Message
        variant="post"
        role="assistant"
        name="Jonah Vale"
        time="7:30 AM"
        subject="Agenda for Friday's design review"
        thread={
          <ThreadSummary
            count={4}
            repliers={repliers}
            lastReply="7:44 AM"
            label="4 replies to Jonah Vale's post Agenda for Friday's design review"
            onOpen={() => setOpened("Opened the thread under Jonah Vale's post")}
          />
        }
      >
        We will look at the new onboarding flow first, then the settings page.
      </Message>
      <Message
        variant="post"
        role="assistant"
        name="Mara Quill"
        time="8:02 AM"
        thread={<ThreadSummary count={0} label="Reply to Mara Quill's post" onOpen={() => setOpened("Started a thread under Mara Quill's post")} />}
      >
        The mockups are in the Files tab.
      </Message>
      <p role="status" style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
        {opened}
      </p>
    </Surface>
  );
}

/** Under posts: who replied, how many replies and when the last came; a post with no replies offers Reply. */
export const UnderPosts: Story = {
  render: () => <Posts />,
};
