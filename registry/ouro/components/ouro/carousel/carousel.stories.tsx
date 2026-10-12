import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Carousel } from "@/registry/ouro/components/ouro/carousel/carousel";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 24,
        maxWidth: 520,
      }}
    >
      {children}
    </div>
  );
}

const dishes = ["Shakshuka", "Short ribs", "Lemon tart", "Green curry", "Focaccia"];

/** A stand-in for a photo or a recipe card. */
function Card({ name }: { name: string }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: 160,
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--muted)",
        color: "var(--foreground)",
        fontSize: 18,
        fontWeight: 500,
      }}
    >
      {name}
    </div>
  );
}

const meta = {
  title: "Display/Carousel",
  component: Carousel,
  parameters: { layout: "padded" },
  args: { label: "Featured recipes", children: null },
  argTypes: {
    slidesPerView: { control: "inline-radio", options: [1, 2, 3] },
    loop: { control: "boolean" },
    children: { control: false },
  },
  render: (args) => (
    <Surface>
      <Carousel {...args}>
        {dishes.map((dish) => (
          <Card key={dish} name={dish} />
        ))}
      </Carousel>
    </Surface>
  ),
} satisfies Meta<typeof Carousel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** One slide at a time, with Previous disabled on the first slide. */
export const Photos: Story = {
  parameters: { screenshot: { name: "carousel" } },
};

/** Two slides at a time that wrap around at the ends. */
export const SeveralPerView: Story = {
  args: { slidesPerView: 2, loop: true },
};
