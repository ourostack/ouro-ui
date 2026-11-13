import { createElement, type ComponentProps, type ReactNode } from "react";
import { expectTypeOf } from "vitest";
import { Hero, type HeroProps } from "@/registry/ouro/components/ouro/hero/hero";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ title: "Dinner, sorted" }>().toExtend<HeroProps>();
expectTypeOf<{ title: "T"; media: ReactNode }>().toExtend<HeroProps>();
expectTypeOf<{
  title: "Dinner, sorted";
  eyebrow: "Recipes";
  description: "Plan the week";
  actions: null;
  picture: { light: { src: "/cover.webp" }; dark: { src: "/cover-dark.webp" }; width: 1536; height: 576; alt: "A cover"; priority: true; crop: "8 / 3"; focus: "50% 30%" };
  layout: "column";
  motion: "none";
  headingLevel: 2;
  className: "mb-8";
}>().toExtend<HeroProps>();
expectTypeOf<ComponentProps<typeof Hero>>().toEqualTypeOf<HeroProps>();

// title is required.
expectTypeOf<{ eyebrow: "Recipes" }>().not.toExtend<HeroProps>();

// A picture needs its size, so the media box can never be wider than the image.
expectTypeOf<{ title: "T"; picture: { light: { src: "/a.webp" }; dark: { src: "/a.webp" }; alt: "x" } }>().not.toExtend<HeroProps>();

// Every hero has light and dark art; neither can be left out.
expectTypeOf<{ title: "T"; picture: { light: { src: "/a.webp" }; width: 1536; height: 576; alt: "x" } }>().not.toExtend<HeroProps>();
expectTypeOf<{ title: "T"; picture: { dark: { src: "/a.webp" }; width: 1536; height: 576; alt: "x" } }>().not.toExtend<HeroProps>();

// The old single-image shape names the fix.
expectTypeOf<{ title: "T"; picture: { src: "/a.webp"; width: 1536; height: 576; alt: "x" } }>().not.toExtend<HeroProps>();

// Guessed props and values name the fix.
expectTypeOf<{ title: "T"; subtitle: "x" }>().not.toExtend<HeroProps>();
expectTypeOf<{ title: "T"; overline: "x" }>().not.toExtend<HeroProps>();
expectTypeOf<{ title: "T"; action: null }>().not.toExtend<HeroProps>();
expectTypeOf<{ title: "T"; image: "x" }>().not.toExtend<HeroProps>();
expectTypeOf<{ title: "T"; heading: "x" }>().not.toExtend<HeroProps>();
expectTypeOf<{ title: "T"; layout: "wide" }>().not.toExtend<HeroProps>();
expectTypeOf<{ title: "T"; motion: "slide" }>().not.toExtend<HeroProps>();
expectTypeOf<{ title: "T"; headingLevel: 3 }>().not.toExtend<HeroProps>();

// @ts-expect-error subtitle is not a prop.
createElement(Hero, { title: "T", subtitle: "x" });

// @ts-expect-error a picture with only light art is a type error: dark is required.
createElement(Hero, { title: "T", picture: { light: { src: "/a.webp" }, width: 1536, height: 576, alt: "x" } });

// @ts-expect-error a picture with only dark art is a type error: light is required.
createElement(Hero, { title: "T", picture: { dark: { src: "/a.webp" }, width: 1536, height: 576, alt: "x" } });

// @ts-expect-error picture.src is not a prop; it names the light and dark fix.
createElement(Hero, { title: "T", picture: { src: "/a.webp", width: 1536, height: 576, alt: "x" } });
