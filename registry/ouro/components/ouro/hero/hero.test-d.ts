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
  picture: { src: "/cover.webp"; width: 1536; height: 576; alt: "A cover"; priority: true; crop: "8 / 3"; focus: "50% 30%" };
  layout: "column";
  motion: "none";
  headingLevel: 2;
  className: "mb-8";
}>().toExtend<HeroProps>();
expectTypeOf<ComponentProps<typeof Hero>>().toEqualTypeOf<HeroProps>();

// title is required.
expectTypeOf<{ eyebrow: "Recipes" }>().not.toExtend<HeroProps>();

// A picture needs its size, so the media box can never be wider than the image.
expectTypeOf<{ title: "T"; picture: { src: "/a.webp"; alt: "x" } }>().not.toExtend<HeroProps>();

// Light and dark art: the same scene by day and at night, each with its size.
expectTypeOf<{
  title: "T";
  picture: { light: { src: "/a.webp"; width: 1536; height: 576; alt: "x"; priority: true }; dark: { src: "/a-night.webp"; width: 1536; height: 576 } };
}>().toExtend<HeroProps>();
expectTypeOf<{ title: "T"; picture: { light: { src: "/a.webp"; width: 1536; height: 576; alt: "x" } } }>().not.toExtend<HeroProps>();
expectTypeOf<{ title: "T"; picture: { light: { src: "/a.webp"; width: 1536; height: 576 }; dark: { src: "/a-night.webp" } } }>().not.toExtend<HeroProps>();

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
