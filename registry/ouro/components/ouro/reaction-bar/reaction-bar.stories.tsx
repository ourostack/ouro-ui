import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { ReactionBar, type Reaction, type ReactionOption } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";

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
        maxWidth: 520,
      }}
    >
      {children}
    </div>
  );
}

const quick: ReactionOption[] = [
  { key: "like", label: "Like", emoji: "👍" },
  { key: "heart", label: "Heart", emoji: "❤️" },
  { key: "laugh", label: "Laugh", emoji: "😄" },
  { key: "surprised", label: "Surprised", emoji: "😮" },
];

/** Every reaction the stand-in picker offers. */
const all: ReactionOption[] = [
  ...quick,
  { key: "party", label: "Party", emoji: "🎉" },
  { key: "thinking", label: "Thinking", emoji: "🤔" },
  { key: "clap", label: "Clap", emoji: "👏" },
  { key: "eyes", label: "Eyes", emoji: "👀" },
];

const reactions: Reaction[] = [
  { key: "like", label: "Like", emoji: "👍", count: 3, mine: true },
  { key: "laugh", label: "Laugh", emoji: "😄", count: 1 },
];

function toggle(list: Reaction[], key: string): Reaction[] {
  const found = list.find((reaction) => reaction.key === key);
  if (!found) return [...list, { ...all.find((option) => option.key === key)!, count: 1, mine: true }];
  return list
    .map((reaction) => (reaction.key === key ? { ...reaction, count: reaction.count + (reaction.mine ? -1 : 1), mine: !reaction.mine } : reaction))
    .filter((reaction) => reaction.count > 0);
}

function Reacting() {
  const [list, setList] = useState(reactions);
  return (
    <Surface>
      <Message
        role="assistant"
        name="Ada Lovelace"
        attachments={<ReactionBar reactions={list} quick={quick} onReact={(key) => setList((current) => toggle(current, key))} />}
      >
        The engine notes are attached. Can someone check the second table?
      </Message>
    </Surface>
  );
}

function Picking() {
  const [list, setList] = useState(reactions);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLElement | null>(null);
  return (
    <Surface>
      <Message
        role="assistant"
        name="Ada Lovelace"
        attachments={
          <ReactionBar
            reactions={list}
            onReact={(key) => setList((current) => toggle(current, key))}
            onMore={(event) => {
              anchor.current = event.currentTarget;
              setOpen(!open);
            }}
            moreOpen={open}
          />
        }
      >
        The engine notes are attached. Can someone check the second table?
      </Message>
      <Popover title="Add a reaction" hideTitle open={open} onOpenChange={setOpen} anchor={anchor} side="top" align="start" className="w-auto">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: 4 }}>
          {all.map((option) => (
            <Button
              key={option.key}
              variant="plain"
              aria-label={option.label}
              onClick={() => {
                setList((current) => (current.some((reaction) => reaction.key === option.key && reaction.mine) ? current : toggle(current, option.key)));
                setOpen(false);
              }}
            >
              <span style={{ fontSize: 20 }}>{option.emoji}</span>
            </Button>
          ))}
        </div>
      </Popover>
    </Surface>
  );
}

const meta = {
  title: "Chat/ReactionBar",
  component: ReactionBar,
  parameters: { layout: "padded" },
  args: { reactions, quick, onReact: () => {} },
} satisfies Meta<typeof ReactionBar>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <ReactionBar {...args} />
    </Surface>
  ),
};

/** Under a message: press a count to add or take back your reaction, or a quick reaction to add it. */
export const InMessage: Story = {
  render: () => <Reacting />,
};

/** `onMore` adds an "Add reaction" button that opens the app's own picker, here a Popover anchored to it. */
export const WithPicker: Story = {
  render: () => <Picking />,
};

/** Without `onReact` the counts are read-only. */
export const ReadOnly: Story = {
  render: () => (
    <Surface>
      <ReactionBar reactions={reactions} />
    </Surface>
  ),
};

/** `disabled` keeps the counts but turns off reacting. */
export const Disabled: Story = {
  render: () => (
    <Surface>
      <ReactionBar reactions={reactions} quick={quick} onReact={() => {}} disabled />
    </Surface>
  ),
};
