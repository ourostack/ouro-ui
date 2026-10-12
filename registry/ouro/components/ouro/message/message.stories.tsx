import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { Message } from "@/registry/ouro/components/ouro/message/message";

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
        maxWidth: 640,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Chat/Message",
  component: Message,
  parameters: { layout: "padded" },
  args: { role: "assistant", name: "Ouro", children: "Rest the dough for an hour, covered, somewhere warm." },
  argTypes: {
    role: { control: "inline-radio", options: ["user", "assistant", "system"] },
  },
} satisfies Meta<typeof Message>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <Message {...args} />
    </Surface>
  ),
};

/** The three roles: the app's note centered, the user's message at the end, the assistant's at the start. */
export const Roles: Story = {
  parameters: { screenshot: { name: "message-roles" } },
  render: () => (
    <Surface>
      <Message role="system" name="Ouro">
        Ada started a conversation
      </Message>
      <Message role="user" name="Ada Lovelace">
        How long should the dough rest?
      </Message>
      <Message role="assistant" name="Ouro">
        About an hour, covered, somewhere warm. It is ready when it has doubled and springs back slowly when you press it.
      </Message>
    </Surface>
  ),
};

/** A reply still being written: the typing indicator, then partial text. */
export const Streaming: Story = {
  render: () => (
    <Surface>
      <Message role="assistant" name="Ouro" streaming />
      <Message role="assistant" name="Ouro" streaming>
        About an hour, covered
      </Message>
    </Surface>
  ),
};

/** Files sent with a message, under the bubble. */
export const WithAttachments: Story = {
  render: () => (
    <Surface>
      <Message
        role="user"
        name="Ada Lovelace"
        attachments={
          <>
            <Attachment name="crumb.jpg" size={348_160} contentType="image/jpeg" href="#crumb" />
            <Attachment name="recipe.pdf" size={2048} href="#recipe" />
          </>
        }
      >
        Here is my crumb. Too dense?
      </Message>
    </Surface>
  ),
};
