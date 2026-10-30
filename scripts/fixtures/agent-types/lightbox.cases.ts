import { type AgentCase } from "./shared.ts";

/** The lightbox snippets in lightbox.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "lightbox01",
    habit: "a lightbox library's slides",
    tsc: [
      "error TS2741: Property ''Use images={[{ src, alt }]}'' is missing in type '{ src: string; alt: string; }[]' but required in type '{ 'Use images={[{ src, alt }]}': never; }'.",
    ],
    dev: '<Lightbox label="Kitchen photos" images={[{ src, alt }]}>',
    names: ["tsc", "dev"],
  },
  {
    id: "lightbox02",
    habit: "a lightbox with no name",
    tsc: [
      "error TS2322: Type '{ images: { src: string; alt: string; }[]; }' is not assignable to type 'IntrinsicAttributes & LightboxProps'.\n" +
        "  Property 'label' is missing in type '{ images: { src: string; alt: string; }[]; }' but required in type 'LightboxBaseProps'.",
    ],
    names: ["tsc"],
  },
  {
    id: "lightbox03",
    habit: "a controlled viewer that nothing can close",
    tsc: [
      "error TS2322: Type '{ label: string; images: { src: string; alt: string; }[]; open: true; index: number; }' is not assignable to type 'IntrinsicAttributes & LightboxProps'.\n" +
        "  Property 'onOpenChange' is missing in type '{ label: string; images: { src: string; alt: string; }[]; open: true; index: number; }' but required in type '{ open: boolean; index?: number | undefined; onOpenChange: (open: boolean) => void; returnFocus?: ((index: number) => HTMLElement | null | undefined) | undefined; className?: never; }'.",
    ],
    dev: '<Lightbox label="Kitchen photos" images={images} open={open} index={index} onOpenChange={setOpen}>',
    names: ["tsc", "dev"],
  },
];

/** Valid lightbox snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["lightboxOk01", "lightboxOk02"];
