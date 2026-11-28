import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { ToolCallGroup, type ToolCallGroupItem } from "@/registry/ouro/components/ouro/tool-call/tool-call-group";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--background)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "calc(var(--radius) + 4px)", padding: 16, display: "grid", gap: 12, maxWidth: 560 }}>
      {children}
    </div>
  );
}

const READ: ToolCallGroupItem = { id: "read", name: "Read file", detail: "recipes/roast.md", status: "done", duration: 0.4, output: "# Roast\n\nOven at 200°C for an hour.\nRest for fifteen minutes before carving." };
const RUNNING: ToolCallGroupItem = { id: "search", name: "Searched the web", detail: "rice on the stove for six", status: "running" };

const DONE: ToolCallGroupItem[] = [
  READ,
  { id: "search", name: "Searched the web", detail: "rice on the stove for six", status: "done", duration: 2.1 },
  { id: "test", name: "Ran command", detail: "npm test", status: "failed", duration: 4.2, output: "Tests  2 passed, 1 failed" },
];

const meta = {
  title: "Chat/ToolCallGroup",
  component: ToolCallGroup,
  parameters: { layout: "padded" },
  args: { calls: DONE },
  render: (args) => (
    <Surface>
      <ToolCallGroup {...args} />
    </Surface>
  ),
} satisfies Meta<typeof ToolCallGroup>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Settled, the group is one line, "Ran 3 tools · 1 failed"; open it to see each call. */
export const Playground: Story = {};

/** While a call runs, the group is open and its title says how many tools are running. */
export const Running: Story = {
  args: { calls: [READ, RUNNING] },
};

/** A turn as your agent takes it: the calls run, then the group closes to one line above the reply. */
export const InAConversation: Story = {
  render: function Render() {
    const [settled, setSettled] = useState(false);
    const calls: ToolCallGroupItem[] = settled
      ? DONE.map((call) => ({ ...call, status: "done" }))
      : [READ, RUNNING];
    return (
      <Surface>
        <ToolCallGroup calls={calls} />
        {settled ? <p style={{ margin: 0 }}>The roast and the carrots share the oven; the rice goes on the stove for the last twenty minutes.</p> : null}
        <button type="button" data-test-harness="" style={{ justifySelf: "start" }} onClick={() => setSettled((value) => !value)}>
          {settled ? "Run again" : "Finish the calls"}
        </button>
      </Surface>
    );
  },
};
