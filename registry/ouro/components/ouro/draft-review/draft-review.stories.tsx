import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { DraftReview, type DraftChange, type DraftReviewSegment } from "@/registry/ouro/components/ouro/draft-review/draft-review";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16, display: "grid", gap: 16, maxWidth: 560 }}>{children}</div>;
}

const segments: DraftReviewSegment[] = [
  { kind: "same", text: "Thanks for the notes. I can meet on " },
  { kind: "delete", text: "Thursday", changeId: "day" },
  { kind: "insert", text: "Friday", changeId: "day" },
  { kind: "same", text: " at ten" },
  { kind: "insert", text: ", and I will bring the revised budget", changeId: "budget" },
  { kind: "same", text: "." },
  { kind: "delete", text: " Sorry for the delay!", changeId: "sorry" },
];
const changes: DraftChange[] = [
  { id: "day", author: "agent", name: "Ouro", time: "2 min ago", source: "Based on 3 messages" },
  { id: "budget", author: "agent", name: "Ouro", time: "2 min ago", source: "Based on the shared budget" },
  { id: "sorry", author: "human", name: "Ada Lovelace", time: "Just now" },
];

/** Settles each change as the person decides: accepted text stays, rejected text goes back. */
function settle(list: DraftReviewSegment[], id: string, accept: boolean): DraftReviewSegment[] {
  return list.flatMap((segment) => {
    if (segment.changeId !== id) return [segment];
    const keep = (segment.kind === "insert") === accept;
    return keep ? [{ kind: "same" as const, text: segment.text }] : [];
  });
}

function Reviewing() {
  const [state, setState] = useState({ segments, changes });
  const decide = (id: string, accept: boolean) =>
    setState((current) => ({ segments: settle(current.segments, id, accept), changes: current.changes.filter((change) => change.id !== id) }));
  const all = (accept: boolean) => setState((current) => ({ segments: current.changes.reduce((list, change) => settle(list, change.id, accept), current.segments), changes: [] }));
  return (
    <Surface>
      <DraftReview
        segments={state.segments}
        changes={state.changes}
        description="Since you last edited"
        onAccept={(id) => decide(id, true)}
        onReject={(id) => decide(id, false)}
        onAcceptAll={() => all(true)}
        onRejectAll={() => all(false)}
        onShowSource={() => {}}
      />
      {/* Once the last change is decided the review is gone, so focus moves to the settled draft. */}
      {state.changes.length === 0 && (
        <p ref={(node) => node?.focus()} tabIndex={-1} style={{ margin: 0 }}>
          {state.segments.map((segment) => segment.text).join("")}
        </p>
      )}
    </Surface>
  );
}

const meta = {
  title: "Chat/DraftReview",
  component: DraftReview,
  parameters: { layout: "padded" },
  args: { segments, changes, onAccept: () => {}, onReject: () => {} },
} satisfies Meta<typeof DraftReview>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  parameters: { screenshot: { name: "draft-review" } },
  render: (args) => (
    <Surface>
      <DraftReview {...args} />
    </Surface>
  ),
};

/** Accept or reject each change, or all at once: the draft settles as you decide. */
export const Review: Story = {
  render: () => <Reviewing />,
};

/** One change, with the app's own whole-draft action in the header. */
export const WithApprove: Story = {
  render: () => (
    <Surface>
      <DraftReview
        segments={segments.slice(0, 4)}
        changes={changes.slice(0, 1)}
        onAccept={() => {}}
        onReject={() => {}}
        actions={
          <Button size="sm" tone="success">
            Approve
          </Button>
        }
      />
    </Surface>
  ),
};
