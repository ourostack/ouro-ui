import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The carousel snippets in carousel.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "carousel01", habit: "shadcn's Embla options", tsc: ["error TS2353: Object literal may only specify known properties, and 'loop' does not exist in type '{ 'Use <Carousel loop>; Carousel takes no Embla options': never; }'."], dev: "<Carousel loop>", names: ["tsc", "dev"] },
  {
    id: "carousel02",
    habit: "a carousel with no name",
    tsc: [`error TS2741: Property 'label' is missing in type '{ children: Element[]; }' but required in type 'CarouselProps'.`],
    names: ["tsc"],
  },
  { id: "carousel03", habit: "shadcn's setApi", tsc: [hint("(open: boolean) => void", "Use <Carousel onIndexChange={setIndex}>")], dev: "<Carousel onIndexChange={setIndex}>", names: ["tsc", "dev"] },
  {
    id: "carousel04",
    habit: "a vertical carousel",
    tsc: [hint("string", "Carousel scrolls horizontally; use a grid for a vertical list")],
    dev: '<div className="grid gap-4">…</div>',
    names: ["tsc", "dev"],
  },
  {
    id: "carousel05",
    habit: "four slides at a time",
    tsc: [notAssignable("4", `1 | 2 | 3 | (number & { 'Use 1, 2 or 3': never; }) | undefined`)],
    dev: "<Carousel slidesPerView={3}>",
    names: ["tsc", "dev"],
  },
];

/** Valid carousel snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["carouselOk01"];
