import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { PlanApproval, type PlanAnswer } from "@/registry/ouro/components/ouro/plan-approval/plan-approval";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16, display: "grid", gap: 12, maxWidth: 560 }}>{children}</div>;
}

/** The plan, as an app would render it. */
function Plan() {
  return (
    <ol style={{ margin: 0, paddingInlineStart: 20, display: "grid", gap: 4 }}>
      <li>Roast the lamb at 200°C for an hour, with the carrots beside it.</li>
      <li>Start the rice on the stove twenty minutes before the end.</li>
      <li>Wilt the greens in the rice's last five minutes.</li>
    </ol>
  );
}

const meta = {
  title: "Chat/PlanApproval",
  component: PlanApproval,
  parameters: { layout: "padded" },
  args: { title: "Your agent's plan for dinner", children: <Plan /> },
  render: (args) => (
    <Surface>
      <PlanApproval {...args} />
    </Surface>
  ),
} satisfies Meta<typeof PlanApproval>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Request changes opens a field for what should change. */
export const Playground: Story = {};

/** Answered: approved from another app, and changes requested with the person's feedback under the line. */
export const Answered: Story = {
  render: (args) => (
    <Surface>
      <PlanApproval {...args} answer={{ decision: "approved", by: "Ana", app: "their phone", at: "9:41" }} />
      <PlanApproval {...args} title="Research helper's plan for the menu" answer={{ decision: "changes-requested", by: "you", app: "the desktop app", feedback: "Make it vegetarian; swap the lamb for a squash." }} />
    </Surface>
  ),
};

/** A turn as your agent takes it: it proposes, and Approve or Request changes settles the plan to one line in place. */
export const InAConversation: Story = {
  render: function Render() {
    const [answer, setAnswer] = useState<PlanAnswer | undefined>(undefined);
    return (
      <Surface>
        <PlanApproval
          title="Your agent's plan for dinner"
          onApprove={() => setAnswer({ decision: "approved", by: "you", app: "this app" })}
          onRequestChanges={(feedback) => setAnswer({ decision: "changes-requested", by: "you", app: "this app", feedback })}
          answer={answer}
        >
          <Plan />
        </PlanApproval>
        <button type="button" data-test-harness="" style={{ justifySelf: "start" }} onClick={() => setAnswer(undefined)}>
          Propose again
        </button>
      </Surface>
    );
  },
};
