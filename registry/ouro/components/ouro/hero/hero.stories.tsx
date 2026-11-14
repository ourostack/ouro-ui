import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A cover as an inline SVG, so the story makes no request. At night the circle is a dim moon. */
function cover(fill: string, moon = "#fff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 576"><rect width="1536" height="576" fill="${fill}"/><circle cx="768" cy="288" r="150" fill="${moon}" fill-opacity=".85"/></svg>`;
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
    picture: {
      light: { src: cover("#2f6b4f"), width: 1536, height: 576, alt: "A green cover with a pale circle", crop: "8 / 3" },
      dark: { src: cover("#10261c", "#c9d6cf"), width: 1536, height: 576 },
    },
  },
  argTypes: {
    layout: { control: "inline-radio", options: ["stage", "column", "split"] },
    motion: { control: "inline-radio", options: ["rise", "none"] },
    headingLevel: { control: "inline-radio", options: [1, 2] },
  },
} satisfies Meta<typeof Hero>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** The default stage: a centred title over a picture that never grows past its own size. Its night art shows in dark mode. */
export const Stage: Story = {};

/** The column layout: text left-aligned in the same column as its picture, which sits under the text. */
export const Column: Story = {
  args: { layout: "column" },
};

/** A long centred lede, balanced into even lines. Each phrase is an inline-block span, so the lede breaks between them rather than mid-phrase. */
export const LongLede: Story = {
  args: {
    description: (
      <>
        <span style={{ display: "inline-block" }}>Plan the week, shop once and cook with what you already have, so dinner is never a scramble</span>{" "}
        <span style={{ display: "inline-block" }}>and the fridge never fills with food you forgot you bought last week or the week before.</span>
      </>
    ),
  },
};

/** A page without a picture, for a plain title and its actions. */
export const TextOnly: Story = {
  args: { picture: undefined, eyebrow: undefined },
};

/** A small picture, shown at its own size rather than stretched to fill the page. */
export const SmallPicture: Story = {
  args: {
    layout: "column",
    picture: {
      light: { src: cover("#3b5b8c"), width: 640, height: 240, alt: "A blue cover with a pale circle" },
      dark: { src: cover("#16233a", "#c9d0dc"), width: 640, height: 240 },
    },
  },
};

/** A decorative picture: the alt text is empty, so screen readers skip it. */
export const Decorative: Story = {
  args: {
    picture: {
      light: { src: cover("#7a5c3e"), width: 1536, height: 576, decorative: true },
      dark: { src: cover("#2e2217", "#d8cfc6"), width: 1536, height: 576 },
    },
  },
};

/** Something live in the picture's place, such as a video or a demo. It rises in like a picture. */
export const LiveMedia: Story = {
  args: {
    picture: undefined,
    media: (
      <div style={{ aspectRatio: "16 / 9", display: "grid", placeItems: "center", background: "#1f3a2c", color: "#fff" }}>
        A live demo goes here
      </div>
    ),
  },
};

/** Inside a page column that already sets the width: `fullWidth` lines the hero up with the page's own edges. */
export const FullWidth: Story = {
  args: { layout: "column", fullWidth: true },
  render: (args) => (
    <div style={{ display: "grid", gap: 24, width: "min(56rem, 100%)", marginInline: "auto", color: "var(--foreground)" }}>
      <Hero {...args} />
      <p style={{ margin: 0 }}>The post starts here, on the same edge as the hero.</p>
    </div>
  ),
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
