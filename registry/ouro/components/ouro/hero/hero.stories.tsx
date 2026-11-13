import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A cover as an inline SVG, so the story makes no request. */
function cover(fill: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 576"><rect width="1536" height="576" fill="${fill}"/><circle cx="768" cy="288" r="150" fill="#fff" fill-opacity=".85"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const meta = {
  title: "Layout/Hero",
  component: Hero,
  parameters: { layout: "padded" },
  args: {
    eyebrow: "Recipes",
    title: "Dinner, sorted",
    description: "Plan the week, shop once and cook with what you already have.",
    actions: <Button>Start planning</Button>,
    picture: { src: cover("#2f6b4f"), width: 1536, height: 576, alt: "A green cover with a pale circle", crop: "8 / 3" },
  },
  argTypes: {
    layout: { control: "inline-radio", options: ["stage", "column"] },
    motion: { control: "inline-radio", options: ["rise", "none"] },
    headingLevel: { control: "inline-radio", options: [1, 2] },
  },
} satisfies Meta<typeof Hero>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** The default stage: a centred title over a picture that never grows past its own size. */
export const Stage: Story = {};

/** The column layout: text left-aligned in the same column as its picture, which sits under the text. */
export const Column: Story = {
  args: { layout: "column" },
};

/** A page without a picture, for a plain title and its actions. */
export const TextOnly: Story = {
  args: { picture: undefined, eyebrow: undefined },
};

/** A small picture, shown at its own size rather than stretched to fill the page. */
export const SmallPicture: Story = {
  args: {
    layout: "column",
    picture: { src: cover("#3b5b8c"), width: 640, height: 240, alt: "A blue cover with a pale circle" },
  },
};

/** A decorative picture: the alt text is empty, so screen readers skip it. */
export const Decorative: Story = {
  args: {
    picture: { src: cover("#7a5c3e"), width: 1536, height: 576, decorative: true },
  },
};

/** The page's content sits under the hero, and the heading is a section title (level 2). */
export const InContext: Story = {
  args: { headingLevel: 2, title: "This week's plans", layout: "column" },
  render: (args) => (
    <div style={{ display: "grid", gap: 24, maxWidth: 880, color: "var(--foreground)" }}>
      <Hero {...args} />
      <p>Your weekly plan follows here.</p>
    </div>
  ),
};
