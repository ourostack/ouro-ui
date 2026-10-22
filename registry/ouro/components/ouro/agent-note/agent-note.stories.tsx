import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { AgentNote } from "@/registry/ouro/components/ouro/agent-note/agent-note";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16, display: "grid", gap: 12, maxWidth: 480 }}>{children}</div>;
}

const agentText = "Sam asks for the rollout numbers before the review. Last week's notes list two open questions about the pilot.";

/** A note an app keeps: it acts only on a person's click about the note on screen. */
function Keeping() {
  const [note, setNote] = useState({ text: agentText, author: "agent" as "agent" | "human", pinned: false, revision: 1, dismissed: false });
  const current = String(note.revision);
  const trusted = (revision: string | undefined, event: { isTrusted: boolean }) => event.isTrusted && revision === current;
  if (note.dismissed) {
    return (
      <Surface>
        <p style={{ margin: 0, fontSize: 14 }}>Dismissed.</p>
      </Surface>
    );
  }
  return (
    <Surface>
      <AgentNote
        text={note.text}
        author={note.author}
        name="Ouro"
        time="5 min ago"
        source="Based on 3 messages and last week's notes"
        pinned={note.pinned}
        revision={current}
        onPin={(revision, event) => trusted(revision, event) && setNote({ ...note, pinned: true })}
        onUnpin={(revision, event) => trusted(revision, event) && setNote({ ...note, pinned: false })}
        onSave={(text, _revision, event) => {
          if (!event.isTrusted) return false;
          setNote({ ...note, text, author: "human", revision: note.revision + 1 });
        }}
        onDismiss={(revision, event) => trusted(revision, event) && setNote({ ...note, dismissed: true })}
      />
    </Surface>
  );
}

const meta = {
  title: "Chat/AgentNote",
  component: AgentNote,
  parameters: { layout: "padded" },
  args: { text: agentText, author: "agent", name: "Ouro", time: "5 min ago", source: "Based on 3 messages and last week's notes" },
  argTypes: {
    author: { control: "inline-radio", options: ["agent", "human"] },
  },
} satisfies Meta<typeof AgentNote>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <AgentNote {...args} onPin={() => {}} onSave={() => {}} onDismiss={() => {}} />
    </Surface>
  ),
};

/** Pin, edit or dismiss the agent's note: once pinned or edited, it is yours and the agent leaves it. */
export const Keep: Story = {
  render: () => <Keeping />,
};

/** The three states: the agent's words, pinned, and edited by the person. */
export const States: Story = {
  render: () => (
    <Surface>
      <AgentNote text={agentText} author="agent" name="Ouro" time="5 min ago" source="Based on 3 messages" onPin={() => {}} onSave={() => {}} onDismiss={() => {}} />
      <AgentNote text={agentText} author="agent" name="Ouro" time="1 h ago" pinned onUnpin={() => {}} onSave={() => {}} onDismiss={() => {}} />
      <AgentNote text="Bring the rollout numbers, and ask about the pilot dates." author="human" name="Ouro" time="Just now" onSave={() => {}} onDismiss={() => {}} />
    </Surface>
  ),
};
