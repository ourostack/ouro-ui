import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { PermissionPrompt, type PermissionAnswer } from "@/registry/ouro/components/ouro/permission-prompt/permission-prompt";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16, display: "grid", gap: 12, maxWidth: 560 }}>
      {children}
    </div>
  );
}

const meta = {
  title: "Chat/PermissionPrompt",
  component: PermissionPrompt,
  parameters: { layout: "padded" },
  args: {
    title: "Your agent wants to run a command",
    detail: "npm install recipe-scaler",
    reason: "To add the package that scales a recipe for six.",
    risk: "medium",
  },
  render: (args) => (
    <Surface>
      <PermissionPrompt {...args} />
    </Surface>
  ),
} satisfies Meta<typeof PermissionPrompt>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Allow once and Deny call `onAllow` and `onDeny`; your app sets `answer` once it has sent it. */
export const Playground: Story = {};

/** Answered in another app: the buttons have given way to who answered, from where and when. */
export const Answered: Story = {
  render: (args) => (
    <Surface>
      <PermissionPrompt {...args} answer={{ decision: "allowed", by: "Ana", app: "their phone", at: "9:41" }} />
      <PermissionPrompt
        title="Research helper wants to edit a file"
        detail="recipes/roast.md"
        reason="To fix the oven temperature in step two."
        risk="low"
        answer={{ decision: "denied", by: "you", app: "the desktop app", at: "9:43" }}
      />
    </Surface>
  ),
};

/** A high-risk request, and one with no risk given, which shows no badge. */
export const Risks: Story = {
  render: () => (
    <Surface>
      <PermissionPrompt title="Your agent wants to delete a folder" detail="rm -r recipes/drafts" reason="To clear out the drafts you said were done." risk="high" />
      <PermissionPrompt title="Your agent wants to read your calendar" reason="To find an evening for the dinner." />
    </Surface>
  ),
};

/** A turn as your agent takes it: it asks, and Allow once or Deny settles the prompt to one line in place. */
export const InAConversation: Story = {
  render: function Render() {
    const [answer, setAnswer] = useState<PermissionAnswer | undefined>(undefined);
    return (
      <Surface>
        <PermissionPrompt
          title="Your agent wants to run a command"
          detail="npm install recipe-scaler"
          reason="To add the package that scales a recipe for six."
          risk="medium"
          onAllow={() => setAnswer({ decision: "allowed", by: "you", app: "this app" })}
          onDeny={() => setAnswer({ decision: "denied", by: "you", app: "this app" })}
          answer={answer}
        />
        {answer?.decision === "allowed" ? <p style={{ margin: 0 }}>Installed. The recipe now scales to six.</p> : null}
        <button type="button" data-test-harness="" style={{ justifySelf: "start" }} onClick={() => setAnswer(undefined)}>
          Ask again
        </button>
      </Surface>
    );
  },
};
