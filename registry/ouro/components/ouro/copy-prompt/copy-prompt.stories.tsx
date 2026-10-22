import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { CopyPrompt } from "@/registry/ouro/components/ouro/copy-prompt/copy-prompt";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16, display: "grid", gap: 12, maxWidth: 520 }}>{children}</div>;
}

const meta = {
  title: "Chat/CopyPrompt",
  component: CopyPrompt,
  parameters: { layout: "padded" },
  args: { text: "Suggest a layout for my mornings: customer chats first, then my calendar." },
} satisfies Meta<typeof CopyPrompt>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <CopyPrompt {...args} />
    </Surface>
  ),
};

/** Several prompts to hand to an agent: each button is described by its own prompt. */
export const Prompts: Story = {
  render: () => (
    <Surface>
      <CopyPrompt text="Suggest a layout for my mornings: customer chats first, then my calendar." />
      <CopyPrompt text={"Summarize my week in three bullets:\n- what shipped\n- what slipped\n- what needs me"} />
    </Surface>
  ),
};
