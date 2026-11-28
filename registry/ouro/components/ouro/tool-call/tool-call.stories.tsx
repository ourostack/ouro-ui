import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { ToolCall } from "@/registry/ouro/components/ouro/tool-call/tool-call";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const LOG =
  "\u001b[1m> recipe-box@1.0.0 test\u001b[0m\n\n" +
  " \u001b[32m✓\u001b[0m scales a recipe for six\n" +
  " \u001b[32m✓\u001b[0m keeps the oven at one temperature\n" +
  " \u001b[31m✗\u001b[0m fits the rice on the stove\n\n" +
  "\u001b[2mTests  2 passed, 1 failed\u001b[0m";

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--background)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "calc(var(--radius) + 4px)", padding: 16, display: "grid", gap: 4, maxWidth: 560 }}>
      {children}
    </div>
  );
}

const meta = {
  title: "Chat/ToolCall",
  component: ToolCall,
  parameters: { layout: "padded" },
  args: { name: "Ran command", detail: "npm test", status: "done", duration: 4.2, output: LOG, outputLanguage: "ansi" },
  render: (args) => (
    <Surface>
      <ToolCall {...args} />
    </Surface>
  ),
} satisfies Meta<typeof ToolCall>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Press the row to show the command's output. */
export const Playground: Story = {};

/** Each status: running, done, failed and waiting for you. Failed and waiting say so in words, not only by colour. */
export const Statuses: Story = {
  render: () => (
    <Surface>
      <ToolCall name="Searched the web" detail="one-oven dinner for six" status="running" />
      <ToolCall name="Read file" detail="recipes/roast.md" status="done" duration={0.4} />
      <ToolCall name="Ran command" detail="npm test" status="failed" duration={4.2} output={LOG} outputLanguage="ansi" />
      <ToolCall name="Edit file" detail="recipes/roast.md" status="waiting" />
    </Surface>
  ),
};

/** A long command is cut short on one line, so the row keeps its height; its output opens below it. */
export const LongDetail: Story = {
  args: {
    detail: "npm test -- --run recipes/roast.test.ts recipes/rice.test.ts recipes/greens.test.ts --reporter verbose",
    defaultOpen: true,
  },
};
