import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { TypingIndicator } from "@/registry/ouro/components/ouro/typing-indicator/typing-indicator";

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

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--background)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "calc(var(--radius) + 4px)", padding: 16, display: "grid", gap: 8, maxWidth: 420 }}>{children}</div>;
}

const meta = {
  title: "Chat/TypingIndicator",
  component: TypingIndicator,
  parameters: { layout: "padded" },
  args: { people: [ana] },
} satisfies Meta<typeof TypingIndicator>;
export default meta;

type Story = StoryObj<typeof meta>;

/** One, two and several people writing, and nobody: the line keeps its height. */
export const Writers: Story = {
  parameters: { screenshot: { name: "typing-indicator" } },
  render: () => (
    <Surface>
      <TypingIndicator people={[ana]} />
      <TypingIndicator people={[ana, grace]} />
      <TypingIndicator people={[ana, grace, alan, { name: "Katherine Johnson" }]} />
      <TypingIndicator people={[]} />
    </Surface>
  ),
};
