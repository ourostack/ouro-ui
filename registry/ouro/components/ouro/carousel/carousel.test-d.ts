import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Carousel, type CarouselProps } from "@/registry/ouro/components/ouro/carousel/carousel";

// A call site's props, typed as the component takes them. A case below keeps children in the props object because it
// checks the props a call passes, children among them, and a .ts file has no JSX to put children in; an app's lint
// (react(no-children-prop)) flags children passed in createElement's props, so the check doesn't call createElement.
const propsOf = <P>(value: P): P => value;

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
// The app can drive the slide, and give the pager its links.
expectTypeOf<{ label: "Photos"; children: "Slides"; index: 2; onIndexChange: (index: number) => void; pagerHref: (index: number) => string }>().toExtend<CarouselProps>();
expectTypeOf<{ label: "Photos"; children: "Slides"; pagerHref: "#slide" }>().not.toExtend<CarouselProps>();
// shadcn's and Embla's props are hint types.
expectTypeOf<{ label: "Photos"; children: "Slides"; opts: { loop: true } }>().not.toExtend<CarouselProps>();
expectTypeOf<{ label: "Photos"; children: "Slides"; setApi: () => void }>().not.toExtend<CarouselProps>();
expectTypeOf<{ label: "Photos"; children: "Slides"; plugins: [] }>().not.toExtend<CarouselProps>();
expectTypeOf<{ label: "Photos"; children: "Slides"; autoplay: true }>().not.toExtend<CarouselProps>();
expectTypeOf<{ label: "Photos"; children: "Slides"; orientation: "vertical" }>().not.toExtend<CarouselProps>();

// @ts-expect-error opts is not a prop.
propsOf<ComponentProps<typeof Carousel>>({ label: "Photos", children: "Slides", opts: { loop: true } });
