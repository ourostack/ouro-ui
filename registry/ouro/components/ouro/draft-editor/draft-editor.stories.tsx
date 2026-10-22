import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { DraftEditor, type DraftReadinessProps, type DraftSegment } from "@/registry/ouro/components/ouro/draft-editor/draft-editor";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16, display: "grid", gap: 16, maxWidth: 520 }}>{children}</div>;
}

const shared: DraftSegment[] = [
  { author: "human", text: "Thanks for the notes. " },
  { author: "agent", text: "I can meet on Friday at ten, and I will bring the revised budget." },
  { author: "human", text: " See you then." },
];

/** A draft the story keeps, as an app would: the text and its runs, from onValueChange. */
function Draft({ initial = shared, ...props }: { initial?: DraftSegment[]; readinessNote?: string | undefined; actions?: ReactNode } & DraftReadinessProps) {
  const [draft, setDraft] = useState({ text: initial.map((segment) => segment.text).join(""), segments: initial });
  return (
    <DraftEditor label="Reply" placeholder="Write a reply" {...props} value={draft.text} segments={draft.segments} onValueChange={(text, segments) => setDraft({ text, segments: segments ?? [{ author: "human", text }] })} />
  );
}

const meta = {
  title: "Chat/DraftEditor",
  component: DraftEditor,
  parameters: { layout: "padded" },
  args: { label: "Reply", value: shared.map((segment) => segment.text).join(""), segments: shared, onValueChange: () => {} },
  argTypes: {
    readiness: { control: "inline-radio", options: ["drafting", "needs-input", "ready-for-review", "approved"] },
  },
} satisfies Meta<typeof DraftEditor>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <DraftEditor {...args} />
    </Surface>
  ),
};

/** The agent's words are highlighted in place. Edit them: what you type becomes yours. */
export const Shared: Story = {
  render: () => (
    <Surface>
      <Draft actions={<Button>Send</Button>} />
    </Surface>
  ),
};

/** Where the draft stands: the agent asks for input or says it is ready, and only a person approves. */
export const Readiness: Story = {
  render: () => (
    <Surface>
      <Draft readiness="needs-input" readinessBy={{ author: "agent", name: "Ouro" }} readinessNote="Which day suits you?" />
      <Draft readiness="ready-for-review" readinessBy={{ author: "agent", name: "Ouro" }} />
      <Draft readiness="approved" readinessBy={{ author: "human", name: "You" }} actions={<Button>Send</Button>} />
    </Surface>
  ),
};

/** The agent asks for input, standing in here for the app: screen readers hear where the draft stands once. */
export const AgentAsks: Story = {
  parameters: {
    conformance: {
      announces: { "Ask for input": "Needs your input, Ouro: Which day suits you?" },
    },
  },
  render: function AgentAsks() {
    const [asked, setAsked] = useState(false);
    return (
      <Surface>
        <Draft
          readiness={asked ? "needs-input" : "ready-for-review"}
          readinessBy={{ author: "agent", name: "Ouro" }}
          readinessNote={asked ? "Which day suits you?" : undefined}
          actions={<Button onClick={() => setAsked(true)}>Ask for input</Button>}
        />
      </Surface>
    );
  },
};

/** A draft only the person has written: no legend, a plain growing box. */
export const PersonOnly: Story = {
  render: () => (
    <Surface>
      <Draft initial={[]} actions={<Button>Send</Button>} />
    </Surface>
  ),
};
