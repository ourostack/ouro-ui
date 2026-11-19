import type { Meta, StoryObj } from "@storybook/react-vite";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ReadReceipt } from "@/registry/ouro/components/ouro/read-receipt/read-receipt";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A drawn portrait as a data URL, so stories load no network image. */
function portrait(background: string, skin: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${background}"/>` +
    `<circle cx="32" cy="26" r="12" fill="${skin}"/><path d="M10 64c2-14 11-21 22-21s20 7 22 21z" fill="${skin}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const ana = { name: "Ana Lind", src: portrait("#c7d2fe", "#8d5524") };
const grace = { name: "Grace Hopper" };
const alan = { name: "Alan Turing", src: portrait("#bbf7d0", "#f1c27d") };
const kate = { name: "Katherine Johnson" };
const edsger = { name: "Edsger Dijkstra" };

const meta = {
  title: "Chat/ReadReceipt",
  component: ReadReceipt,
  parameters: { layout: "padded" },
  args: { readers: [ana, grace] },
} satisfies Meta<typeof ReadReceipt>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Under the last message each person has seen: two read the first, the rest read the newest. */
export const InAChat: Story = {
  parameters: { screenshot: { name: "read-receipt" } },
  render: () => (
    <div style={{ background: "var(--background)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "calc(var(--radius) + 4px)", maxWidth: 480 }}>
      <MessageList label="Messages" style={{ height: 320 }}>
        <Message variant="chat" role="assistant" name="Ana Lind" avatar={ana.src}>
          Is the launch still at ten?
        </Message>
        <Message variant="chat" role="user" name="You" footer={<ReadReceipt readers={[grace, kate]} />}>
          Yes, ten sharp.
        </Message>
        <Message variant="chat" role="user" name="You" footer={<ReadReceipt readers={[ana, alan, edsger, { name: "Radia Perlman" }]} />}>
          Bring the engine notes.
        </Message>
      </MessageList>
    </div>
  ),
};
