import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Accordion } from "@/registry/ouro/components/ouro/accordion/accordion";
import { Text } from "@/registry/ouro/components/ouro/text/text";

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
        padding: 24,
        display: "grid",
        gap: 24,
        maxWidth: 560,
      }}
    >
      {children}
    </div>
  );
}

const faq = [
  { value: "storage", title: "How long does it keep?", content: <Text>Three days in the fridge, in a covered container.</Text> },
  { value: "freeze", title: "Can I freeze it?", content: <Text>Yes, for up to a month. Thaw it overnight in the fridge.</Text> },
  { value: "vegan", title: "Is there a vegan version?", content: <Text>Swap the butter for olive oil and the egg for flax.</Text> },
];

const meta = {
  title: "Lists/Accordion",
  component: Accordion,
  parameters: { layout: "padded" },
  args: { items: faq },
  argTypes: { disabled: { control: "boolean" }, headingLevel: { control: "select", options: [2, 3, 4, 5, 6] } },
} satisfies Meta<typeof Accordion>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** A recipe's questions, one open at a time. */
export const InContext: Story = {
  args: { defaultValue: "storage" },
  parameters: { screenshot: { name: "accordion" } },
  render: (args) => (
    <Surface>
      <Accordion {...args} />
    </Surface>
  ),
};

/** Several open at once, with one item disabled. */
export const Multiple: Story = {
  render: () => (
    <Surface>
      <Accordion multiple defaultValue={["storage", "vegan"]} items={[faq[0]!, { ...faq[1]!, disabled: true }, faq[2]!]} />
    </Surface>
  ),
};
