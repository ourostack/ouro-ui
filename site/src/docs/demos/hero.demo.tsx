import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";

// The live demo at the top of docs/hero/: the component as an app would use it, with its props, nothing else.

export default function HeroDemo(): JSX.Element {
  return (
    <Hero
      eyebrow="Recipes"
      title="Dinner, sorted"
      description="Plan the week in one place, then shop from the list."
      actions={<Button>Start planning</Button>}
      picture={{
        light: {
          src: "/brand/storybook/headers/ouro-ui-core.webp",
          width: 1536,
          height: 576,
          alt: "Six jars of paint pour glowing ribbons of colour onto a phone, a laptop and a tablet, while Ouro, a green snake, watches.",
          crop: "8 / 3",
        },
        dark: { src: "/brand/storybook/headers/ouro-ui-core-dark.webp", width: 1536, height: 576 },
      }}
    />
  );
}
