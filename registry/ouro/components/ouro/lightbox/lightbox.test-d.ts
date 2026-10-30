import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Lightbox, type LightboxImage, type LightboxProps } from "@/registry/ouro/components/ouro/lightbox/lightbox";

// Type tests: `pnpm typecheck` compiles this file, and every `@ts-expect-error`
// fails the check if the line below it stops being an error.

const images: LightboxImage[] = [{ src: "/a.jpg", alt: "The old kitchen" }];

expectTypeOf<{ label: "Kitchen photos"; images: typeof images }>().toExtend<LightboxProps>();
expectTypeOf<{
  label: "Kitchen photos";
  images: readonly LightboxImage[];
  loop: true;
  closeLabel: "Cerrar";
  previousLabel: "Anterior";
  nextLabel: "Siguiente";
  positionLabel: "{n} de {total}";
  originalLabel: "Ver original";
  className: "max-w-2xl";
}>().toExtend<LightboxProps>();
expectTypeOf<{ src: "/a.jpg"; alt: "A"; thumbnail: "/a-small.jpg"; title: "Before"; caption: "Dark cabinets"; href: "/a.jpg" }>().toExtend<LightboxImage>();
expectTypeOf<ComponentProps<typeof Lightbox>>().toEqualTypeOf<LightboxProps>();

// Controlled: the viewer alone.
expectTypeOf<{
  label: "Kitchen photos";
  images: typeof images;
  open: boolean;
  index: 1;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}>().toExtend<LightboxProps>();
expectTypeOf<{ label: "Kitchen photos"; images: typeof images; open: true; onOpenChange: (open: boolean) => void }>().toExtend<LightboxProps>();
// open needs onOpenChange; index and onOpenChange need open; a controlled Lightbox takes no className.
expectTypeOf<{ label: "Kitchen photos"; images: typeof images; open: true }>().not.toExtend<LightboxProps>();
expectTypeOf<{ label: "Kitchen photos"; images: typeof images; index: 1 }>().not.toExtend<LightboxProps>();
expectTypeOf<{ label: "Kitchen photos"; images: typeof images; onOpenChange: (open: boolean) => void }>().not.toExtend<LightboxProps>();
expectTypeOf<{ label: "Kitchen photos"; images: typeof images; open: true; onOpenChange: (open: boolean) => void; className: "mt-4" }>().not.toExtend<LightboxProps>();

// The label is required.
expectTypeOf<{ images: typeof images }>().not.toExtend<LightboxProps>();
// Every image needs its alt.
expectTypeOf<{ src: "/a.jpg" }>().not.toExtend<LightboxImage>();
// A lightbox library's `slides` is a hint type.
expectTypeOf<{ label: "Photos"; images: typeof images; slides: typeof images }>().not.toExtend<LightboxProps>();

// @ts-expect-error slides is not a prop.
createElement(Lightbox, { label: "Photos", images, slides: images });
