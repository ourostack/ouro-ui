import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Carousel, type CarouselProps } from "@/registry/ouro/components/ouro/carousel/carousel";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

expectTypeOf<{ label: "Recipe photos"; children: "Slides" }>().toExtend<CarouselProps>();
expectTypeOf<{
  label: "Recipe photos";
  children: "Slides";
  loop: true;
  slidesPerView: 3;
  defaultIndex: 2;
  onIndexChange: (index: number) => void;
  previousLabel: "Anterior";
  nextLabel: "Siguiente";
  slideLabel: "Foto {n} de {total}";
  className: "max-w-xl";
}>().toExtend<CarouselProps>();
expectTypeOf<ComponentProps<typeof Carousel>>().toEqualTypeOf<CarouselProps>();

// The label is required.
expectTypeOf<{ children: "Slides" }>().not.toExtend<CarouselProps>();
// slidesPerView is 1, 2 or 3.
expectTypeOf<{ label: "Photos"; children: "Slides"; slidesPerView: 4 }>().not.toExtend<CarouselProps>();
// shadcn's and Embla's props are hint types.
expectTypeOf<{ label: "Photos"; children: "Slides"; opts: { loop: true } }>().not.toExtend<CarouselProps>();
expectTypeOf<{ label: "Photos"; children: "Slides"; setApi: () => void }>().not.toExtend<CarouselProps>();
expectTypeOf<{ label: "Photos"; children: "Slides"; plugins: [] }>().not.toExtend<CarouselProps>();
expectTypeOf<{ label: "Photos"; children: "Slides"; autoplay: true }>().not.toExtend<CarouselProps>();
expectTypeOf<{ label: "Photos"; children: "Slides"; orientation: "vertical" }>().not.toExtend<CarouselProps>();

// @ts-expect-error opts is not a prop.
createElement(Carousel, { label: "Photos", children: "Slides", opts: { loop: true } });
