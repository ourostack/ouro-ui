import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LayoutProposal } from "@/registry/ouro/components/ouro/layout-proposal/layout-proposal";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16, display: "grid", gap: 16, maxWidth: 720 }}>{children}</div>;
}

/** A sketch of the proposed columns: a story's own markup, passed as LayoutProposal's children. */
function Columns({ names }: { names: string[] }) {
  return (
    <ol aria-label="Proposed columns" style={{ display: "flex", gap: 4, margin: 0, padding: 0, listStyle: "none" }}>
      {names.map((name) => (
        <li
          key={name}
          style={{ flex: 1, minWidth: 0, border: "1px solid var(--border)", borderRadius: "calc(var(--radius) - 4px)", padding: "2px 8px", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {name}
        </li>
      ))}
    </ol>
  );
}

const layouts = {
  mine: ["Conversations", "Conversation", "Calendar"],
  p1: ["Customer chats", "Conversation", "Agenda"],
  p2: ["Calendar", "Conversation"],
};

/** An app that holds one proposal and refuses a decision about one it no longer holds. */
function Proposing() {
  const [proposal, setProposal] = useState<{ id: "p1" | "p2"; title: string } | null>({ id: "p1", title: "Customers first" });
  const [previewing, setPreviewing] = useState(false);
  const [current, setCurrent] = useState<string[]>(layouts.mine);
  const [log, setLog] = useState("Your layout: Conversations, Conversation, Calendar");
  // Once the person decides, the bar goes: focus moves to the line that says what happened.
  const said = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!proposal) said.current!.focus();
  }, [proposal]);
  const decide = (apply: boolean) => (id: string, event: { isTrusted: boolean }) => {
    if (!proposal || !event.isTrusted || id !== proposal.id) {
      setLog("That proposal changed before your click, so nothing was applied.");
      // Refused: the proposal stays undecided.
      return false;
    }
    if (apply) setCurrent(layouts[proposal.id]);
    setLog(apply ? `Applied: ${layouts[proposal.id].join(", ")}` : "Discarded.");
    setPreviewing(false);
    setProposal(null);
  };
  const shown = previewing && proposal ? layouts[proposal.id] : current;
  return (
    <Surface>
      {proposal && (
        <LayoutProposal
          proposalId={proposal.id}
          title={proposal.title}
          by="Ouro"
          time="Just now"
          reason="You open customer chats first most mornings, so they could take the first column."
          previewing={previewing}
          onPreview={() => setPreviewing(true)}
          onEndPreview={() => setPreviewing(false)}
          onApply={decide(true)}
          onDiscard={decide(false)}
        >
          <Columns names={layouts[proposal.id]} />
        </LayoutProposal>
      )}
      <div style={{ display: "flex", gap: 8 }} data-testid="surface">
        {shown.map((name) => (
          <div key={name} style={{ flex: 1, border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: 12, fontSize: 14 }}>
            {name}
          </div>
        ))}
      </div>
      <p ref={said} tabIndex={-1} style={{ margin: 0, fontSize: 14 }}>
        {log}
      </p>
    </Surface>
  );
}

const meta = {
  title: "Chat/LayoutProposal",
  component: LayoutProposal,
  parameters: { layout: "padded" },
  args: {
    proposalId: "p1",
    title: "Customers first",
    by: "Ouro",
    time: "2 min ago",
    reason: "You open customer chats first most mornings, so they could take the first column.",
    onApply: () => {},
    onDiscard: () => {},
  },
} satisfies Meta<typeof LayoutProposal>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <LayoutProposal {...args}>
        <Columns names={layouts.p1} />
      </LayoutProposal>
    </Surface>
  ),
};

/** Preview the proposal in place, go back, then apply or discard it. */
export const Proposal: Story = {
  render: () => <Proposing />,
};

/** While previewing: the note says nothing has changed yet. */
export const Previewing: Story = {
  render: () => (
    <Surface>
      <LayoutProposal proposalId="p1" title="Customers first" by="Ouro" previewing onPreview={() => {}} onEndPreview={() => {}} onApply={() => {}} onDiscard={() => {}}>
        <Columns names={layouts.p1} />
      </LayoutProposal>
    </Surface>
  ),
};
